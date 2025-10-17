// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";

class CodeActionProvider implements coc.CodeActionProvider {
    public provideCodeActions(
        document: coc.TextDocument,
        _: coc.Range,
        _context: coc.CodeActionContext,
        _token: coc.CancellationToken
    ): coc.CodeAction[] | undefined {
        const addDependencyCommand: coc.Command = {
            title: "Add dependency from Maven Central...",
            command: "maven.project.addDependency",
            arguments: [{ pomPath: coc.Uri.parse(document.uri).fsPath }]
        };
        return [
            {
                title: "Add dependency from Maven Central...",
                kind: coc.CodeActionKind.Source,
                command: addDependencyCommand,
                isPreferred: true
            }
        ] as coc.CodeAction[];
    }
}

export const codeActionProvider: CodeActionProvider = new CodeActionProvider();
