// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { ITreeItem } from "./ITreeItem";
import { MavenProject } from "./MavenProject";

export class LifecyclePhase implements ITreeItem {
    constructor(
        public project: MavenProject,
        public phase: string
    ) {}

    public getContextValue(): string {
        return "maven:lifecycle";
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.phase, coc.TreeItemCollapsibleState.None);
        treeItem.command = {
            title: "Execute lifecycle phase",
            command: `maven.explorer.phase.${this.phase}`,
            arguments: [this]
        } as coc.Command;
        return treeItem;
    }
}
