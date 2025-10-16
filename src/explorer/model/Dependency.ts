// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { ITreeItem } from "./ITreeItem";
import { ITreeNode } from "./ITreeNode";
import { IOmittedStatus } from "./OmittedStatus";

export class Dependency implements ITreeItem, ITreeNode {
    public fullArtifactName = ""; // groupId:artifactId:version:scope
    public projectPomPath: string;
    public groupId: string;
    public artifactId: string;
    public version: string;
    public scope: string;
    public omittedStatus?: IOmittedStatus;
    public uri: coc.Uri | undefined;
    public children: Dependency[] = [];
    public root: Dependency | undefined;
    public parent: Dependency | undefined;
    constructor(gid: string, aid: string, version: string, scope: string, projectPomPath: string, omittedStatus?: IOmittedStatus) {
        this.groupId = gid;
        this.artifactId = aid;
        this.version = version;
        this.scope = scope;
        this.fullArtifactName = [gid, aid, version, scope].join(":");
        this.projectPomPath = projectPomPath;
        this.omittedStatus = omittedStatus;
    }

    public addChild(node: Dependency): void {
        node.parent = this;
        this.children.push(node);
    }

    public getContextValue(): string {
        const root = this.root;
        let contextValue = "maven:dependency";
        if (root?.fullArtifactName === this.fullArtifactName) {
            contextValue = `${contextValue}+root`;
        }
        if (this.omittedStatus?.status === "conflict") {
            contextValue = `${contextValue}+conflict`;
        }
        return contextValue;
    }

    public async getChildren(): Promise<Dependency[] | undefined> {
        return Promise.resolve(this.children);
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        const label = [this.groupId, this.artifactId, this.version].join(":");
        const treeItem: coc.TreeItem = new coc.TreeItem(label);
        treeItem.resourceUri = this.uri;
        if (this.children.length !== 0) {
            treeItem.collapsibleState = coc.TreeItemCollapsibleState.Collapsed;
        } else {
            treeItem.collapsibleState = coc.TreeItemCollapsibleState.None;
        }

        // description
        const descriptions: string[] = [];
        if (!this.scope.includes("compile")) {
            descriptions.push(`(${this.scope})`);
        }
        if (this.omittedStatus !== undefined) {
            descriptions.push(this.omittedStatus.description);
        }
        treeItem.description = descriptions.join(" ");
        treeItem.command = {
            title: "Goto dependency definition",
            command: "maven.exploerer.dependency.action",
            arguments: [this]
        } as coc.Command;
        return treeItem;
    }
}
