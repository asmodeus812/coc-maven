// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { diagnosticProvider } from "../../DiagnosticProvider";
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
        const tree = await coc.window.withProgress({ title: "Computing dependency tree..." }, async () => this.project.getDependencyTree());
        await diagnosticProvider.refreshDiagnostics(coc.Uri.file(this.project.pomPath));
        if (tree === undefined) {
            // the failed calculation was reported already
            return [new HintNode("Dependency tree not available")];
        } else if (tree.treeNodes.length === 0) {
            return [new HintNode("No dependencies")];
        } else {
            return tree.treeNodes;
        }
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.name as string, coc.TreeItemCollapsibleState.Collapsed);
        const uri: coc.Uri = coc.Uri.file(this.name as string);
        treeItem.resourceUri = uri.with({ authority: this.project.pomPath }); // distinguish dependenciesMenu in multi-module project
        return treeItem;
    }

    public refresh(): void {
        MavenExplorerProvider.getInstance().refresh(this);
    }
}
