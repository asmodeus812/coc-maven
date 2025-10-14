// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { diagnosticProvider } from "../../DiagnosticProvider";
import { parseRawDependencyDataHandler } from "../../handlers/parseRawDependencyDataHandler";
import { MavenExplorerProvider } from "../MavenExplorerProvider";
import { Dependency } from "./Dependency";
import { HintNode } from "./HintNode";
import { ITreeItem } from "./ITreeItem";
import { MavenProject } from "./MavenProject";
import { ProjectMenu } from "./Menu";

export class DependenciesMenu extends ProjectMenu implements ITreeItem {
    constructor(project: MavenProject) {
        super(project);
        this.name = "Dependencies";
    }

    public getContextValue(): string {
        return "maven:dependenciesMenu";
    }

    public async getChildren(): Promise<Dependency[] | HintNode[]> {
        const treeNodes = await parseRawDependencyDataHandler(this.project);
        await diagnosticProvider.refreshDiagnostics(coc.Uri.file(this.project.pomPath));
        if (treeNodes.length === 0) {
            const hintNodes: HintNode[] = [new HintNode("No dependencies")];
            return Promise.resolve(hintNodes);
        } else {
            return Promise.resolve(treeNodes);
        }
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.name as string, coc.TreeItemCollapsibleState.Collapsed);
        const uri: coc.Uri = coc.Uri.file("");
        treeItem.resourceUri = uri.with({ authority: this.project.pomPath }); // distinguish dependenciesMenu in multi-module project
        treeItem.tooltip = this.name;
        return treeItem;
    }

    public refresh(): void {
        this._savePom();
        MavenExplorerProvider.getInstance().refresh(this);
    }

    private _savePom(): void {
        const pomUri: coc.Uri = coc.Uri.file(this.project.pomPath);
        const textEditor: coc.TextEditor | undefined = coc.window.visibleTextEditors.find(
            (editor) => editor.document.uri.toString() === pomUri.toString()
        );
        if (textEditor !== undefined) {
            // textEditor.document.save();
        }
    }
}
