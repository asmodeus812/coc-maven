// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { rawEffectivePom } from "../utils/mavenUtils";
import { Utils } from "../utils/Utils";
import { IEffectivePom } from "./model/IEffectivePom";

export class EffectivePomProvider {
    private readonly pomPath: string;
    private calculation?: {
        cacheOnly: boolean;
        promise: Promise<IEffectivePom | undefined>;
    };

    constructor(pomPath: string) {
        this.pomPath = pomPath;
    }

    private async readEffectivePom(options: { cacheOnly?: boolean }): Promise<IEffectivePom | undefined> {
        const pomPath: string = this.pomPath;
        const ePomString: string | undefined = await rawEffectivePom(pomPath, options);
        if (ePomString === undefined) {
            return undefined;
        }
        const ePom: unknown = await Utils.parseXmlContent(ePomString);
        return { pomPath, ePomString, ePom };
    }

    /**
     * Concurrent requests with the same options share the same in-flight calculation, requests with different options wait
     * for the in-flight calculation to settle first, its result or failure belongs to its own callers.
     */
    public async getEffectivePom(options?: { cacheOnly?: boolean }): Promise<IEffectivePom | undefined> {
        const cacheOnly = options?.cacheOnly === true;
        while (this.calculation) {
            const current = this.calculation;
            if (current.cacheOnly === cacheOnly) {
                return current.promise;
            }
            await Promise.allSettled([current.promise]);
        }

        const promise = this.readEffectivePom({ cacheOnly });
        this.calculation = { cacheOnly, promise };
        try {
            return await promise;
        } finally {
            this.calculation = undefined;
        }
    }
}
