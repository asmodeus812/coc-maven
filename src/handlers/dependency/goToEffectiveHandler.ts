// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Dependency } from "../../explorer/model/Dependency";
import { Queue } from "../../taskExecutor";

export async function searchFirstEffective(dependencyNodes: Dependency[], fullArtifactName: string): Promise<Dependency | undefined> {
    let targetItem: Dependency | undefined;
    const queue: Queue<Dependency> = new Queue();
    for (const child of dependencyNodes) {
        queue.push(child);
    }
    while (queue.empty() === false) {
        const node: Dependency | undefined = queue.pop();
        if (node === undefined) {
            throw new Error("Failed to find dependency.");
        }
        if (node.fullArtifactName === fullArtifactName) {
            targetItem = node;
            break;
        }
        const children = node.children;
        for (const child of children) {
            queue.push(child);
        }
    }
    return targetItem;
}
