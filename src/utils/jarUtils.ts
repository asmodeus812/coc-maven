// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as jszip from "jszip";

export async function readContentFromJar(jarPath: string, entryPath: string): Promise<string | undefined> {
    // the archive is binary, read the raw bytes, reading it through the workspace would decode it as text and corrupt it
    const data: Buffer = await fse.readFile(jarPath);
    const zipData = await jszip.loadAsync(data);
    const zipObj = zipData.file(entryPath);
    return zipObj?.async("text");
}
