// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { DEFAULT_MAVEN_LIFECYCLES } from "../../completion/constants";
import { ITreeItem } from "./ITreeItem";
import { LifecyclePhase } from "./LifecyclePhase";
import { MavenProject } from "./MavenProject";
import { ProjectMenu } from "./Menu";

export class LifecycleMenu extends ProjectMenu implements ITreeItem {
    constructor(project: MavenProject) {
        super(project);
        this.name = "Lifecycle";
    }

    public async getChildren(): Promise<LifecyclePhase[]> {
        return DEFAULT_MAVEN_LIFECYCLES.map((goal) => new LifecyclePhase(this.project, goal));
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.name, coc.TreeItemCollapsibleState.Collapsed);
        return treeItem;
    }
}
