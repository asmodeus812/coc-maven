// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import * as fse from "fs-extra";
import { mavenOutputPath, readFileIfExists } from "../utils/mavenUtils";

/**
 * Provides one maven output of a project, such as its effective pom or its dependency tree, as the model parsed from its
 * output file. The file is written again only after the pom changed, the modification time of the pom it belongs to is
 * stored next to it.
 *
 * Readers always get the last valid model. Only loading runs maven: the first read does it once, a change of the pom
 * invalidates the model so that the next read loads again. A failed attempt keeps the last valid
 * model and is reported once, the next attempt waits for the next change of the pom.
 */
export class MavenOutputProvider<T> {
    private readonly outputPath: string;
    private readonly mtimePath: string;
    private current?: T;
    private changeCounter = 0;
    private latestChange = -1;
    private refreshing?: Promise<T | undefined>;
    private running?: coc.CancellationTokenSource;

    constructor(
        private readonly pomPath: string,
        name: string,
        private readonly label: string,
        private readonly run: (pomPath: string, token: coc.CancellationToken) => Promise<string | undefined>,
        private readonly parse: (pomPath: string, text: string) => Promise<T>,
        // the poms the output depends on, the pom itself and the parents it inherits from, their mtimes key the cache
        private readonly sourcePaths: () => string[] = () => [pomPath]
    ) {
        this.outputPath = mavenOutputPath(pomPath, name);
        this.mtimePath = `${this.outputPath}.mtime`;
    }

    // the pom changed, the next read loads the model again, a maven run for the previous state is killed
    public invalidate(): void {
        this.changeCounter++;
        this.running?.cancel();
    }

    public async get(): Promise<T | undefined> {
        // load until the model belongs to the latest change, a change while loading loads again
        while (this.latestChange !== this.changeCounter) {
            this.refreshing ??= this.load().finally(() => {
                this.refreshing = undefined;
            });
            await this.refreshing;
        }
        return this.current;
    }

    private async load(): Promise<T | undefined> {
        // a change of the pom while loading keeps the model stale
        const change: number = this.changeCounter;
        try {
            const mtimes: number[] = await Promise.all(this.sourcePaths().map(async (source) => (await fse.stat(source)).mtimeMs));
            await this.loadState(mtimes.join(","));
        } catch (error) {
            coc.window.showWarningMessage(`Failed to calculate ${this.label} - ${(error as Error).message}, keeping the previous state`);
        }
        this.latestChange = change;
        return this.current;
    }

    private async loadState(mtime: string): Promise<void> {
        // the output file of this state of the pom, a missing or damaged one is a miss
        const cached: T | undefined = (await readFileIfExists(this.mtimePath)) === mtime ? await this.parseCached() : undefined;
        if (cached !== undefined) {
            this.current = cached;
            return;
        }
        // coc runs extensions in a vm context without AbortController, a cancellation token kills the process instead
        const running = new coc.CancellationTokenSource();
        this.running = running;
        let text: string | undefined;
        try {
            text = await this.run(this.pomPath, running.token);
        } catch (error) {
            if (running.token.isCancellationRequested) {
                // killed for a newer state of the pom, the next load runs maven for it
                return;
            }
            throw error;
        } finally {
            if (this.running === running) {
                this.running = undefined;
            }
            running.dispose();
        }
        if (text !== undefined) {
            // the written file belongs to this state of the pom
            await fse.writeFile(this.mtimePath, mtime);
            this.current = await this.parse(this.pomPath, text);
        }
    }

    private async parseCached(): Promise<T | undefined> {
        const text: string | undefined = await readFileIfExists(this.outputPath);
        try {
            return text === undefined ? undefined : await this.parse(this.pomPath, text);
        } catch {
            return undefined;
        }
    }
}
