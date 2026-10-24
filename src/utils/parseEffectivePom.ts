// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { IEffectivePom } from "../explorer/model/IEffectivePom";
import { Utils } from "./Utils";

export async function parseEffectivePom(_pomPath: string, text: string): Promise<IEffectivePom> {
    const ePom: unknown = await Utils.parseXmlContent(text);
    return { text, ePom };
}
