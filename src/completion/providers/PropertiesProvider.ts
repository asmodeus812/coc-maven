// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element, isTag, Node } from "domhandler";
import * as coc from "coc.nvim";
import { MavenProjectManager } from "../../project/MavenProjectManager";
import { XmlTagName } from "../../utils/lexerUtils";
import { trimBrackets } from "../utils";
import { IXmlCompletionProvider } from "./IXmlCompletionProvider";

export class PropertiesProvider implements IXmlCompletionProvider {
    async provide(document: coc.TextDocument, position: coc.Position, currentNode: Node): Promise<coc.CompletionItem[]> {
        let tagNode: Element | undefined;
        if (isTag(currentNode)) {
            tagNode = currentNode;
        } else if (currentNode.parent && isTag(currentNode.parent)) {
            tagNode = currentNode.parent;
        } else {
            // TODO: should we recursively traverse up to find nearest tag node?
            return [];
        }

        const documentText = document.getText();
        const cursorOffset = document.offsetAt(position);
        const eol = process.platform == "win32" ? "\n" : "\r\n";

        const ret: coc.CompletionItem[] = [];
        switch (tagNode.tagName) {
            case XmlTagName.Properties: {
                const project = MavenProjectManager.get(document.uri);
                const props = project?.getProperties();

                if (props) {
                    const propertyToCompletionItem = (prop: string) => {
                        const item = { label: prop, kind: coc.CompletionItemKind.Property } as coc.CompletionItem;
                        const insertText = `<${prop}>$1</${prop}>${eol}$0`;
                        const snippetContent: string = trimBrackets(insertText, documentText, cursorOffset);
                        item.insertText = snippetContent;
                        return item;
                    };

                    const items = props.map(propertyToCompletionItem);
                    ret.push(...items);
                }
            }
        }
        return ret;
    }
}

