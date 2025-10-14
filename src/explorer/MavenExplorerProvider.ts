// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { TreeDataProvider } from "coc.nvim";
import { MavenProjectManager } from "../project/MavenProjectManager";
import { Dependency } from "./model/Dependency";
import { ITreeItem } from "./model/ITreeItem";
import { MavenProject } from "./model/MavenProject";
import { PluginsMenu } from "./model/PluginsMenu";
import { WorkspaceFolder } from "./model/WorkspaceFolder";

export class MavenExplorerProvider implements TreeDataProvider<ITreeItem> {
    private static INSTANCE: MavenExplorerProvider;
    public static getInstance() {
        if (!this.INSTANCE) {
            this.INSTANCE = new MavenExplorerProvider();
        }
        return this.INSTANCE;
    }

    public readonly onDidChangeTreeData: coc.Event<ITreeItem | undefined>;
    private readonly _onDidChangeTreeData: coc.Emitter<ITreeItem | undefined>;

    private constructor() {
        this._onDidChangeTreeData = new coc.Emitter<ITreeItem>();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.refresh();
    }

    public updateProjects(...items: MavenProject[]): void {
        MavenProjectManager.update(...items);
    }

    public addProject(pomPath: string): void {
        MavenProjectManager.add(pomPath);
        this.refresh();
    }

    public removeProject(pomPath: string): void {
        MavenProjectManager.remove(pomPath);
        this.refresh();
    }

    public async addWorkspaceFolder(folder: coc.WorkspaceFolder): Promise<void> {
        await MavenProjectManager.loadProjects(folder);
        this.refresh();
    }

    public async removeWorkspaceFolder(folder: coc.WorkspaceFolder): Promise<void> {
        await MavenProjectManager.removeAllFrom(folder);
        this.refresh();
    }

    public getTreeItem(element: ITreeItem): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        return Promise.resolve(element.getTreeItem()).then((item) => {
            item.tooltip = element.getContextValue();
            return item;
        });
    }
    public async getChildren(element?: ITreeItem): Promise<ITreeItem[] | undefined> {
        if (element === undefined) {
            // Top level elements
            if (!coc.workspace.workspaceFolders) {
                return undefined;
            }
            if (coc.workspace.workspaceFolders.length === 1) {
                // single root workspace
                return await new WorkspaceFolder(coc.workspace.workspaceFolders[0]).getChildren();
            } else {
                // multi-root workspace
                return coc.workspace.workspaceFolders.map((workspaceFolder) => new WorkspaceFolder(workspaceFolder));
            }
        } else {
            return element.getChildren ? element.getChildren() : undefined;
        }
    }
    public async getParent(element: ITreeItem): Promise<ITreeItem | undefined> {
        if (element instanceof Dependency) {
            return element.parent;
        } else {
            return undefined;
        }
    }

    public refresh(item?: ITreeItem): void {
        if (item instanceof PluginsMenu) {
            item.project.refreshEffectivePom().catch(console.error);
        }
        this._onDidChangeTreeData.fire(item);
    }
}
