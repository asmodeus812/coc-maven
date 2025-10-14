// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Node } from "domhandler";
import * as coc from "coc.nvim";
import { getNodePath } from "../../utils/lexerUtils";
import { getXsdElement, XSDElement } from "../../mavenXsd";
import { trimBrackets } from "../utils";
import { IXmlCompletionProvider } from "./IXmlCompletionProvider";

export class SchemaProvider implements IXmlCompletionProvider {
    async provide(document: coc.TextDocument, position: coc.Position, currentNode: Node): Promise<coc.CompletionItem[]> {
        const documentText = document.getText();
        const cursorOffset = document.offsetAt(position);
        const eol = process.platform !== "win32" ? "\n" : "\r\n";

        const nodePath = getNodePath(currentNode);
        const elem = getXsdElement(nodePath);
        const defToCompletionItem = (e: XSDElement) => {
            const name = e.name;
            const item = { label: name, kind: coc.CompletionItemKind.Property } as coc.CompletionItem;
            let insertText: string;
            if (e.isLeaf) {
                // <textNode>|</textNode>
                insertText = `<${name}>$1</${name}>$0`;
            } else {
                // <complexNode>
                //   |
                // </complexNode>
                insertText = [`<${name}>`, "\t$0", `</${name}>`].join(eol);
            }
            const snippetContent: string = trimBrackets(insertText, documentText, cursorOffset);
            item.insertText = snippetContent;

            if (e.isDeprecated) {
                item.tags = [coc.CompletionItemTag.Deprecated];
            }
            item.documentation = e.markdownString;

            // trigger completion again immediately for non-leaf node
            if (!e.isLeaf) {
                item.command = {
                    command: "editor.action.triggerSuggest",
                    title: "Trigger Suggest"
                };
            }
            return item;
        };

        const items = elem?.candidates.map(defToCompletionItem) ?? [];
        return items;
    }
}

