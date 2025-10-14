// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { ITreeItem } from "./ITreeItem";
import { MavenProject } from "./MavenProject";

export class MavenProfile implements ITreeItem {
    constructor(
        public project: MavenProject,
        public id: string,
        public active: boolean,
        public source: string
    ) {}

    public selected: boolean | undefined;

    public getContextValue(): string {
        if (this.checked()) {
            return "maven:profile+checked";
        } else {
            return "maven:profile+unchecked";
        }
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.id, coc.TreeItemCollapsibleState.None);
        treeItem.description = `(${this.checked() ? "enabled" : "disabled"})`;
        treeItem.command = {
            title: "Goto dependency definition",
            command: "maven.explorer.profile.toggle",
            arguments: [this]
        } as coc.Command;
        return treeItem;
    }

    private checked(): boolean {
        if (this.selected === undefined) {
            return this.active;
        } else {
            return this.selected;
        }
    }
}
