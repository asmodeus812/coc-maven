// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Node } from "domhandler";
import * as coc from "coc.nvim";

export interface IPomCompletionProvider {
    provideCompletionItems(
        document: coc.TextDocument,
        position: coc.Position,
        currentNode: Node
    ): Promise<coc.CompletionItem[] | coc.CompletionList | undefined>;
}

