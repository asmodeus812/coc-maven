// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { Dependency } from "../../explorer/model/Dependency";
import { ITreeItem } from "../../explorer/model/ITreeItem";
import { MavenProject } from "../../explorer/model/MavenProject";
import { MavenProjectManager } from "../../project/MavenProjectManager";

/**
 * Reveal and select, in the explorer, the dependency node which won the conflict resolution against the given omitted
 * dependency node, i.e. the effective dependency that is actually used by the project.
 */
export async function goToEffectiveHandler(view: coc.TreeView<ITreeItem>, node?: Dependency): Promise<void> {
    if (node === undefined || node.omittedStatus === undefined) {
        throw new Error("No conflict dependency node specified.");
    }
    const fullArtifactName: string = [node.groupId, node.artifactId, node.omittedStatus.effectiveVersion, node.scope].join(":");
    const project: MavenProject | undefined = MavenProjectManager.get(node.projectPomPath);
    if (project === undefined) {
        throw new Error("Failed to find maven projects.");
    }

    const treeItem: Dependency | undefined = searchFirstEffective((await project.getDependencyTree())?.treeNodes ?? [], fullArtifactName);
    if (treeItem === undefined) {
        throw new Error(`Failed to find effective dependency ${fullArtifactName}.`);
    }
    await view.reveal(treeItem, { select: true, focus: true });
}

function searchFirstEffective(dependencyNodes: Dependency[], fullArtifactName: string): Dependency | undefined {
    const queue: Dependency[] = [...dependencyNodes];
    let node: Dependency | undefined = queue.shift();
    while (node !== undefined && node.fullArtifactName !== fullArtifactName) {
        queue.push(...node.children);
        node = queue.shift();
    }
    return node;
}
