// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Node } from "domhandler";
import * as coc from "coc.nvim";

export interface IXmlCompletionProvider {
    provide(document: coc.TextDocument, position: coc.Position, currentNode: Node): Promise<coc.CompletionItem[]>;
}
