// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";

export function isXmlExtensionEnabled(): boolean {
    return coc.extensions.getExtensionById("coc-xml")?.isActive || false;
}
