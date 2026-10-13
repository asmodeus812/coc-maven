// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import * as coc from "coc.nvim";

const VERSION_VALUE_MAX = 999;
const VERSION_VALUE_DIGITS = 3;

// tslint:disable-next-line:export-name
export function getSortText(version: string): string {
    const segments: string[] = version.split(/\.|-/);
    const [major, minor, patch] = segments.map((x) => Number.parseInt(x, 10)).map((x) => (Number.isInteger(x) ? x : 0));
    return [major, minor, patch].map((v) => _.padStart((VERSION_VALUE_MAX - v).toString(), VERSION_VALUE_DIGITS, "0")).join("");
}

export function trimBrackets(snippetContent: string, fileContent: string, offset: number): string {
    let ret: string = snippetContent;
    // trim left "<" when previous chars contain "<"
    const sectionStart: number = fileContent.lastIndexOf(">", offset - 1) + 1;
    const preChars: string = fileContent.slice(sectionStart, offset).trim();
    if (preChars.startsWith("<")) {
        ret = ret.slice(1, ret.length);
    }
    // trim right ">" when next char is ">"
    const postChar: string = fileContent[offset];
    if (postChar === ">") {
        ret = ret.slice(0, ret.length - 1);
    }
    return ret;
}

export async function settledAll(promises: Promise<coc.CompletionItem[]>[]): Promise<coc.CompletionItem[][]> {
    const results = await Promise.allSettled(promises);
    return results.map((r) => {
        if (r.status === "fulfilled") {
            return r.value;
        }
        console.error(r.reason);
        return [];
    });
}
