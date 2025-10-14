// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Node } from "domhandler";
import * as coc from "coc.nvim";
import { getCurrentNode, getEnclosingTag, XmlTagName } from "../utils/lexerUtils";

class CodeActionProvider implements coc.CodeActionProvider {
    public provideCodeActions(
        document: coc.TextDocument,
        range: coc.Range,
        _context: coc.CodeActionContext,
        _token: coc.CancellationToken
    ): coc.Command[] | undefined {
        const documentText: string = document.getText();
        const cursorOffset: number = document.offsetAt(range.start);
        const currentNode: Node | undefined = getCurrentNode(documentText, cursorOffset);
        if (currentNode === undefined || currentNode.startIndex === null || currentNode.endIndex === null) {
            return undefined;
        }

        const tagNode = getEnclosingTag(currentNode);

        if (tagNode?.tagName === XmlTagName.Dependencies) {
            const addDependencyCommand: coc.Command = {
                command: "maven.project.addDependency",
                title: "Add a dependency from Maven Central Repository...",
                arguments: [
                    {
                        pomPath: document.uri
                    }
                ]
            };
            return [addDependencyCommand];
        }

        return undefined;
    }
}

export const codeActionProvider: CodeActionProvider = new CodeActionProvider();
