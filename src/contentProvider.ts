// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import * as fse from "fs-extra";
import * as path from "path";
import { IDependencyTree } from "./explorer/model/IDependencyTree";
import { IEffectivePom } from "./explorer/model/IEffectivePom";
import { MavenProject } from "./explorer/model/MavenProject";
import { MavenProjectManager } from "./project/MavenProjectManager";
import { UserError } from "./utils/errorUtils";
import { Utils } from "./utils/Utils";

/**
 * URI patterns and authorities.
 * coc-maven://dependencies/<pom-path>/Dependencies?<pom-path>
 * coc-maven://effective-pom/<pom-path>/EffectivePOM.xml?<pom-path>
 * coc-maven://local-repository/<pom-path-in-local-maven-repository>
 */
class MavenContentProvider implements coc.TextDocumentContentProvider {
    public readonly onDidChange: coc.Event<coc.Uri>;
    private readonly _onDidChangeEmitter: coc.Emitter<coc.Uri>;
    private readonly _contents: Map<string, string> = new Map();

    constructor() {
        this._onDidChangeEmitter = new coc.Emitter<coc.Uri>();
        this.onDidChange = this._onDidChangeEmitter.event;
    }

    public invalidate(uri: coc.Uri): void {
        this._onDidChangeEmitter.fire(uri);
    }

    public async provideTextDocumentContent(uri: coc.Uri, _token: coc.CancellationToken): Promise<string | undefined> {
        const key: string = uri.toString();
        try {
            const content: string | undefined = await this.computeContent(uri);
            if (content !== undefined) {
                this._contents.set(key, content);
            }
            return content;
        } catch (error) {
            // an already open document (e.g. after a restart of the extension host) still holds the last good content
            const opened: string | undefined = coc.workspace.getDocument(key)?.textDocument.getText();
            const previous: string | undefined = this._contents.get(key) ?? (opened ? opened : undefined);
            if (previous === undefined) {
                throw error;
            }
            // refreshing an already open document failed, keep the previous content instead of failing, coc does not
            // handle rejected refreshes; the outputs of a project keep their last valid state themselves, this covers
            // poms outside the projects and invalid document paths
            coc.window.showWarningMessage(`Unable to refresh ${uri.authority}, keeping previous content: ${(error as Error).message}`);
            return previous;
        }
    }

    private async computeContent(uri: coc.Uri): Promise<string | undefined> {
        if (uri.scheme !== "coc-maven") {
            throw new Error(`Scheme ${uri.scheme} not supported by this content provider.`);
        }

        const pomPath = uri.query;
        if (uri.authority === "dependencies" || uri.authority === "effective-pom") {
            // these documents run maven against the pom from the query, only accept real pom files on disk
            await validatePomPath(pomPath);
        }
        switch (uri.authority) {
            case "dependencies": {
                const project: MavenProject | undefined = MavenProjectManager.get(pomPath);
                if (project) {
                    const dependencyTree: IDependencyTree | undefined = await project.getDependencyTree();
                    return dependencyTree?.text;
                } else {
                    return Utils.getDependencyTree(pomPath);
                }
            }
            case "effective-pom": {
                const project: MavenProject | undefined = MavenProjectManager.get(pomPath);
                if (project) {
                    const effectivePom: IEffectivePom | undefined = await project.getEffectivePom();
                    return effectivePom?.text;
                } else {
                    return Utils.getEffectivePom(pomPath);
                }
            }
            case "local-repository": {
                const fsUri = uri.with({ scheme: "file", authority: "" });
                return await coc.workspace.readFile(fsUri.toString());
            }
            default:
        }
        return undefined;
    }
}

async function validatePomPath(pomPath: string): Promise<void> {
    if (!path.isAbsolute(pomPath)) {
        throw new UserError(`Maven content requires an absolute POM path, got: ${pomPath}`);
    }
    const stat: fse.Stats = await fse.stat(pomPath).catch(() => {
        throw new UserError(`The requested POM ${pomPath} does not exist.`);
    });
    if (!stat.isFile()) {
        throw new UserError(`The requested POM ${pomPath} is not a file.`);
    }
}

export const contentProvider: MavenContentProvider = new MavenContentProvider();
