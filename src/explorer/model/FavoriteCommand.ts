// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { TreeItem } from "coc.nvim";
import { ITreeItem } from "./ITreeItem";
import { MavenProject } from "./MavenProject";

export class FavoriteCommand implements ITreeItem {
    constructor(
        public project: MavenProject,
        public command: string,
        public alias: string,
        public debug?: boolean
    ) {}

    getContextValue(): string {
        return "maven:favorites";
    }

    getTreeItem(): TreeItem | coc.Thenable<TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.command, coc.TreeItemCollapsibleState.None);
        treeItem.description = this.alias;
        treeItem.command = {
            title: "Execute favorite command",
            command: "maven.explorer.favorites",
            arguments: [this]
        } as coc.Command;
        return treeItem;
    }
}
