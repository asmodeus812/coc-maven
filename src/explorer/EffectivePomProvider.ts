// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { rawEffectivePom } from "../utils/mavenUtils";
import { Utils } from "../utils/Utils";
import { IEffectivePom } from "./model/IEffectivePom";

export class EffectivePomProvider {
    private readonly pomPath: string;
    private calculation?: Promise<IEffectivePom | undefined>;

    constructor(pomPath: string) {
        this.pomPath = pomPath;
    }

    private async readEffectivePom(): Promise<IEffectivePom | undefined> {
        const pomPath: string = this.pomPath;
        const ePomString: string | undefined = await rawEffectivePom(pomPath);
        if (ePomString === undefined) {
            return undefined;
        }
        const ePom: unknown = await Utils.parseXmlContent(ePomString);
        return { pomPath, ePomString, ePom };
    }

    /**
     * Concurrent requests share the in-flight calculation and its result or failure.
     */
    public async getEffectivePom(): Promise<IEffectivePom | undefined> {
        if (this.calculation) {
            return this.calculation;
        }
        const promise = this.readEffectivePom();
        this.calculation = promise;
        try {
            return await promise;
        } finally {
            this.calculation = undefined;
        }
    }
}
