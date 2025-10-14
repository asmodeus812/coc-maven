// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Node } from "domhandler";
import * as coc from "coc.nvim";
import { isXmlExtensionEnabled } from "../utils/extensionUtils";
import { getCurrentNode } from "../utils/lexerUtils";
import { ArtifactProvider } from "./providers/ArtifactProvider";
import { IXmlCompletionProvider } from "./providers/IXmlCompletionProvider";
import { PropertiesProvider } from "./providers/PropertiesProvider";
import { SchemaProvider } from "./providers/SchemaProvider";
import { SnippetProvider } from "./providers/SnippetProvider";

export class PomCompletionProvider implements coc.CompletionItemProvider {
    private readonly providers: IXmlCompletionProvider[];

    constructor() {
        const providers = [new SnippetProvider(), new ArtifactProvider(), new PropertiesProvider()];

        if (!isXmlExtensionEnabled()) {
            providers.push(new SchemaProvider());
        }

        this.providers = providers;
    }

    async provideCompletionItems(
        document: coc.TextDocument,
        position: coc.Position,
        _token: coc.CancellationToken,
        _context: coc.CompletionContext
    ): Promise<coc.CompletionItem[] | coc.CompletionList | undefined> {
        const documentText: string = document.getText();
        const cursorOffset: number = document.offsetAt(position);
        const currentNode: Node | undefined = getCurrentNode(documentText, cursorOffset);
        if (currentNode?.startIndex === null || currentNode?.endIndex === null) {
            return undefined;
        }

        const result: coc.CompletionItem[] = [];
        for (const provider of this.providers) {
            result.push(...(await provider.provide(document, position, currentNode as Node)));
        }
        return result;
    }
}

