// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { ProjectMenu } from "./Menu";
import { ITreeItem } from "./ITreeItem";
import { MavenProject } from "./MavenProject";
import { FavoriteCommand } from "./FavoriteCommand";
import { Settings } from "../../Settings";

export class FavoritesMenu extends ProjectMenu implements ITreeItem {
    constructor(project: MavenProject) {
        super(project);
        this.name = "Favorites";
    }

    public getContextValue(): string {
        return "maven:favoritesMenu";
    }

    public async getChildren(): Promise<FavoriteCommand[] | undefined> {
        return Settings.Terminal.favorites(this.project);
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.name, coc.TreeItemCollapsibleState.Collapsed);
        return treeItem;
    }
}

