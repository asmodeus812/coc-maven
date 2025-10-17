// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { MavenExplorerProvider } from "../MavenExplorerProvider";
import { pluginInfoProvider } from "../pluginInfoProvider";
import { ITreeItem } from "./ITreeItem";
import { MavenProject } from "./MavenProject";
import { PluginGoal } from "./PluginGoal";

const CONTEXT_VALUE = "maven:plugin";

export class MavenPlugin implements ITreeItem {
    public project: MavenProject;
    public groupId: string;
    public artifactId: string;
    public version: string;

    public prefix: string | undefined;
    public goals: string[] | undefined;

    constructor(project: MavenProject, groupId: string, artifactId: string, version: string) {
        this.project = project;
        this.groupId = groupId;
        this.artifactId = artifactId;
        this.version = version;
    }

    private get pluginId(): string {
        let pluginId = `${this.groupId}:${this.artifactId}`;
        if (this.version !== undefined) {
            pluginId += `:${this.version}`;
        }
        return pluginId;
    }

    public getContextValue(): string {
        return CONTEXT_VALUE;
    }

    public async getTreeItem(): Promise<coc.TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem(this.pluginId, coc.TreeItemCollapsibleState.Collapsed);
        await this.fetchPrefix();
        return treeItem;
    }

    public async getChildren(): Promise<PluginGoal[]> {
        try {
            await this.fetchGoals();
        } catch (error) {
            console.warn((error as Error).message);
            return [];
        }
        return this.goals ? this.goals.map((goal) => new PluginGoal(this, goal)) : [];
    }

    public async refresh(): Promise<void> {
        MavenExplorerProvider.getInstance().refresh(this);
    }

    private async fetchPrefix(): Promise<void> {
        if (this.prefix !== undefined) {
            return;
        }
        this.prefix = await pluginInfoProvider.getPluginPrefix(this.groupId, this.artifactId);
    }

    private async fetchGoals(): Promise<void> {
        if (this.goals !== undefined) {
            return;
        }
        const goals = await pluginInfoProvider.getPluginGoals(this.project.pomPath, this.groupId, this.artifactId, this.version);
        this.goals = goals?.filter((name: string) => !!name && name.length > 0);
    }
}
