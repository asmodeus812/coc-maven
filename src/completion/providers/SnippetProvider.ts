// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element, isTag, Node } from "domhandler";
import * as coc from "coc.nvim";
import { XmlTagName } from "../../utils/lexerUtils";
import { COMMAND_COMPLETION_ITEM_SELECTED } from "../constants";
import { trimBrackets } from "../utils";
import { IXmlCompletionProvider } from "./IXmlCompletionProvider";

const artifactSegments: string[] = ["\t<groupId>$1</groupId>", "\t<artifactId>$2</artifactId>"];
const dependencySnippetString = (eol: string) => ["<dependency>", ...artifactSegments, "</dependency>"].join(eol);

const pluginSnippetString = (eol: string) => ["<plugin>", ...artifactSegments, "</plugin>"].join(eol);

export class SnippetProvider implements IXmlCompletionProvider {
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
        const eol = process.platform !== "win32" ? "\n" : "\r\n";

        const ret: coc.CompletionItem[] = [];
        switch (tagNode.tagName) {
            case XmlTagName.Dependencies: {
                const snippetItem: coc.CompletionItem = { label: "dependency", kind: coc.CompletionItemKind.Snippet } as coc.CompletionItem;
                const snippetContent: string = trimBrackets(dependencySnippetString(eol), documentText, cursorOffset);
                const dependencySnippet: string = snippetContent;
                snippetItem.insertText = dependencySnippet;
                snippetItem.detail = "Maven Snippet";
                snippetItem.command = {
                    title: "selected",
                    command: COMMAND_COMPLETION_ITEM_SELECTED,
                    arguments: [{ completeFor: "dependency", source: "snippet" }]
                };
                ret.push(snippetItem);
                break;
            }
            case XmlTagName.Plugins: {
                const snippetItem: coc.CompletionItem = { label: "plugin", kind: coc.CompletionItemKind.Snippet } as coc.CompletionItem;
                const snippetContent: string = trimBrackets(pluginSnippetString(eol), documentText, cursorOffset);
                const pluginSnippet: string = snippetContent;
                snippetItem.insertText = pluginSnippet;
                snippetItem.detail = "Maven Snippet";
                snippetItem.command = {
                    title: "selected",
                    command: COMMAND_COMPLETION_ITEM_SELECTED,
                    arguments: [{ completeFor: "plugin", source: "snippet" }]
                };
                ret.push(snippetItem);
                break;
            }
            default:
        }
        return ret;
    }
}

