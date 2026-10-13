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
import { settledAll } from "./utils";

export class PomCompletionProvider implements coc.CompletionItemProvider {
    private readonly genericProviders: IXmlCompletionProvider[];
    private readonly schemaProvider: IXmlCompletionProvider;

    constructor() {
        this.genericProviders = [new SnippetProvider(), new ArtifactProvider(), new PropertiesProvider()];
        this.schemaProvider = new SchemaProvider();
    }

    async provideCompletionItems(
        document: coc.TextDocument,
        position: coc.Position,
        token: coc.CancellationToken,
        _context: coc.CompletionContext
    ): Promise<coc.CompletionItem[] | coc.CompletionList | undefined> {
        if (token.isCancellationRequested) {
            return undefined;
        }
        const documentText: string = document.getText();
        const cursorOffset: number = document.offsetAt(position);
        const currentNode: Node | undefined = getCurrentNode(documentText, cursorOffset);
        if (currentNode?.startIndex === null || currentNode?.endIndex === null) {
            return undefined;
        }

        const providers: IXmlCompletionProvider[] = [...this.genericProviders];
        if (!isXmlExtensionEnabled()) {
            providers.push(this.schemaProvider);
        }
        const results: coc.CompletionItem[][] = await settledAll(
            providers.map((provider) => provider.provide(document, position, currentNode as Node, token))
        );
        if (token.isCancellationRequested) {
            return undefined;
        }
        return results.flat();
    }
}

export const completionProvider: PomCompletionProvider = new PomCompletionProvider();
