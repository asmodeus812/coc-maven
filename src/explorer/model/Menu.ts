// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { ITreeItem } from "./ITreeItem";
import { MavenProject } from "./MavenProject";

const CONTEXT_VALUE = "maven:menu";

export abstract class Menu implements ITreeItem {
    protected name: string | undefined;

    public abstract getChildren(): ITreeItem[] | undefined | Promise<ITreeItem[] | undefined>;

    public getContextValue(): string {
        return CONTEXT_VALUE;
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        return new coc.TreeItem(this.name as string, coc.TreeItemCollapsibleState.Collapsed);
    }
}

export abstract class ProjectMenu extends Menu {
    constructor(public project: MavenProject) {
        super();
    }
}
