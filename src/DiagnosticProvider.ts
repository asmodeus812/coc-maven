// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import { performance } from "perf_hooks";
import * as coc from "coc.nvim";
import { getRequestDelay, lruCache, MovingAverage } from "./debouncing";
import { Dependency } from "./explorer/model/Dependency";
import { MavenProject } from "./explorer/model/MavenProject";
import { getDependencyNode } from "./handlers/dependency/utils";
import { MavenProjectManager } from "./project/MavenProjectManager";
import { Settings } from "./Settings";

export const MAVEN_DEPENDENCY_CONFLICT = "Maven dependency conflict";

class DiagnosticProvider {
    private _collection: coc.DiagnosticCollection | undefined;
    private updateNodeForDocumentTimeout: NodeJS.Timer | undefined;
    public map: Map<coc.Diagnostic, Dependency> = new Map();

    public initialize(context: coc.ExtensionContext): void {
        const dependencyCollection = coc.languages.createDiagnosticCollection("Dependency");
        this._collection = dependencyCollection;
        context.subscriptions.push(this._collection);
        context.subscriptions.push(
            coc.workspace.onDidChangeTextDocument(async (e) => {
                if (e.textDocument.uri.endsWith("pom.xml")) {
                    await this.debouncedRefresh(coc.Uri.parse(e.document.uri));
                }
            })
        );
    }

    private async debouncedRefresh(uri: coc.Uri): Promise<void> {
        if (this.updateNodeForDocumentTimeout) {
            clearTimeout(this.updateNodeForDocumentTimeout);
        }
        const timeout: number = getRequestDelay(uri);
        this.updateNodeForDocumentTimeout = setTimeout(async () => {
            const startTime: number = performance.now();
            await this.refreshDiagnostics(uri);
            const executionTime: number = performance.now() - startTime;
            const movingAverage: MovingAverage = lruCache.get(uri) || new MovingAverage();
            movingAverage.update(executionTime);
            lruCache.set(uri, movingAverage);
        }, timeout);
    }

    public async refreshDiagnostics(uri: coc.Uri): Promise<void> {
        const diagnostics: coc.Diagnostic[] = [];
        if (Settings.enableConflictDiagnostics() === false) {
            this._collection?.set(uri.fsPath, diagnostics);
            return;
        }
        const project: MavenProject | undefined = MavenProjectManager.get(uri.fsPath);
        if (project === undefined) {
            return;
        }

        const conflictNodes: Dependency[] = project.conflictNodes;
        for (const node of conflictNodes) {
            const diagnostic = await this.createDiagnostics(node);
            if (diagnostic) {
                diagnostics.push(diagnostic);
                this.map.set(diagnostic, node);
            }
        }
        this._collection?.set(uri.fsPath, diagnostics);
    }

    public async createDiagnostics(node: Dependency): Promise<coc.Diagnostic | undefined> {
        const root: Dependency = node.root as Dependency;
        const range: coc.Range | undefined = await this.findConflictRange(root.projectPomPath, root.groupId, root.artifactId);
        if (!range) {
            return undefined;
        }

        const message = `Dependency conflict in ${root.artifactId}: ${node.groupId}:${node.artifactId}:${node.version} conflict with ${node.omittedStatus?.effectiveVersion}`;
        const diagnostic: coc.Diagnostic = coc.Diagnostic.create(range, message, coc.DiagnosticSeverity.Warning);
        diagnostic.code = MAVEN_DEPENDENCY_CONFLICT;
        return diagnostic;
    }

    public async findConflictRange(pomPath: string, gid: string, aid: string): Promise<coc.Range | undefined> {
        const dependencyNode = await getDependencyNode(pomPath, gid, aid);
        if (!dependencyNode?.startIndex || !dependencyNode?.endIndex) {
            console.warn(`Failed to find dependency node ${gid}:${aid} in ${pomPath}.`);
            return undefined;
        }

        const baseDocument: coc.Document = await coc.workspace.openTextDocument(coc.Uri.file(pomPath));
        const currentDocument: coc.TextDocument = baseDocument.textDocument;
        return coc.Range.create(currentDocument.positionAt(dependencyNode.startIndex), currentDocument.positionAt(dependencyNode.endIndex));
    }
}

export const diagnosticProvider: DiagnosticProvider = new DiagnosticProvider();
