// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { diagnosticProvider, MAVEN_DEPENDENCY_CONFLICT } from "../DiagnosticProvider";
import { Dependency } from "../explorer/model/Dependency";
import { MavenProjectManager } from "../project/MavenProjectManager";

export class ConflictResolver implements coc.CodeActionProvider {
    public static readonly providedCodeActionKinds: coc.CodeActionKind[] = [coc.CodeActionKind.QuickFix];

    public provideCodeActions(
        document: coc.TextDocument,
        _range: coc.Range,
        context: coc.CodeActionContext,
        _token: coc.CancellationToken
    ): coc.CodeAction[] {
        return context.diagnostics
            .filter((diagnostic) => diagnostic.code === MAVEN_DEPENDENCY_CONFLICT)
            .map((diagnostic) => this.createCommandCodeAction(diagnostic, document));
    }

    private createCommandCodeAction(diagnostic: coc.Diagnostic, document: coc.TextDocument): coc.CodeAction {
        const node: Dependency | undefined = diagnosticProvider.map.get(diagnostic);
        if (node === undefined) {
            throw new Error("Failed to find Dependency.");
        }
        const gid: string = node.groupId;
        const aid: string = node.artifactId;
        const effectiveVersion: string = node.omittedStatus?.effectiveVersion ?? node.version;

        const actionSetVersion = { title: `Resolve conflict for ${gid}:${aid}`, kind: coc.CodeActionKind.QuickFix } as coc.CodeAction;
        actionSetVersion.command = {
            command: "maven.project.setDependencyVersion",
            title: "set version to",
            arguments: [
                {
                    pomPath: document.uri,
                    effectiveVersion,
                    groupId: gid,
                    artifactId: aid,
                    fullDependencyText: MavenProjectManager.get(document.uri)?.fullText
                }
            ]
        };
        actionSetVersion.diagnostics = [diagnostic];
        actionSetVersion.isPreferred = true;
        return actionSetVersion;
    }
}

export const conflictResolver: ConflictResolver = new ConflictResolver();
