// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";

export class LruCache<K, V extends object> {
    private readonly values = new Map<K, V>();

    constructor(private readonly maxSize: number) {}

    public get(key: K): V | undefined {
        const value: V | undefined = this.values.get(key);
        if (value) {
            this.values.delete(key);
            this.values.set(key, value);
        }
        return value;
    }

    public set(key: K, value: V): void {
        this.values.delete(key);
        this.values.set(key, value);
        if (this.values.size > this.maxSize) {
            const [oldest] = this.values.keys();
            this.values.delete(oldest);
        }
    }
}

export const lruCache: LruCache<string, MovingAverage> = new LruCache<string, MovingAverage>(32);

// See: https://github.com/microsoft/vscode/blob/94c9ea46838a9a619aeafb7e8afd1170c967bb55/src/vs/base/common/numbers.ts
export class MovingAverage {
    private _n = 1;
    private _val = 0;

    public update(value: number): this {
        this._val = this._val + (value - this._val) / this._n;
        this._n += 1;
        return this;
    }

    public get value(): number {
        return this._val;
    }
}

export function getRequestDelay(uri: coc.Uri): number {
    const avg: MovingAverage | undefined = lruCache.get(uri.toString());
    if (!avg) {
        return 350;
    }
    // See: https://github.com/microsoft/vscode/blob/94c9ea46838a9a619aeafb7e8afd1170c967bb55/src/vs/editor/common/modes/languageFeatureRegistry.ts#L204
    return Math.max(350, Math.floor(1.3 * avg.value));
}
