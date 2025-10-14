// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { ITreeItem } from "./ITreeItem";
import { MavenPlugin } from "./MavenPlugin";

export class PluginGoal implements ITreeItem {
    public plugin: MavenPlugin;
    public name: string;

    constructor(plugin: MavenPlugin, name: string) {
        this.plugin = plugin;
        this.name = name;
    }

    public getContextValue(): string {
        return "maven:pluginGoal";
    }
    public getTreeItem(): coc.TreeItem {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.name, coc.TreeItemCollapsibleState.None);
        treeItem.command = {
            title: "Execute plugin goal",
            command: "maven.explorer.plugin.goal",
            arguments: [this]
        } as coc.Command;
        return treeItem;
    }

    public get command(): string {
        if (this.name.includes(":")) {
            // workaround for compatibility in case the name already contains prefix
            return this.name;
        }
        return `${this.plugin.prefix}:${this.name}`;
    }
}
