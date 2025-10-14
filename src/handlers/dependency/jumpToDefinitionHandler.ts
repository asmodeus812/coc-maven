// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element } from "domhandler";
import * as coc from "coc.nvim";
import { Dependency } from "../../explorer/model/Dependency";
import { localPomPath } from "../../utils/contextUtils";
import { UserError } from "../../utils/errorUtils";
import { getDependencyNode } from "./utils";

export async function jumpToDefinitionHandler(node?: Dependency): Promise<void> {
    if (node === undefined) {
        throw new Error("No dependency node specified.");
    }

    let selectedPath: string;
    if (node.parent === undefined) {
        selectedPath = node.projectPomPath;
    } else {
        const parent: Dependency = node.parent;
        selectedPath = localPomPath(parent.groupId, parent.artifactId, parent.version);
    }
    await goToDefinition(selectedPath, node.groupId, node.artifactId);
}

async function goToDefinition(pomPath: string, gid: string, aid: string): Promise<void> {
    const dependencyNode = await getDependencyNode(pomPath, gid, aid);
    if (dependencyNode !== undefined) {
        await locateInFile(pomPath, dependencyNode);
    } else {
        throw new Error("Failed to locate the dependency.");
    }
}

async function locateInFile(pomPath: string, targetNode: Element): Promise<void> {
    if (targetNode.startIndex === null || targetNode.endIndex === null) {
        throw new UserError("Invalid target XML node to locate.");
    }
    const location: coc.Uri = coc.Uri.file(pomPath);
    const baseDocument: coc.Document = await coc.workspace.openTextDocument(location);
    const currentDocument: coc.TextDocument = baseDocument.textDocument;
    await coc.commands.executeCommand("maven.project.resource.open", location);

    const start = currentDocument.positionAt(targetNode.startIndex);
    const end = currentDocument.positionAt(targetNode.endIndex);

    const nvim = coc.workspace.nvim;
    await nvim.call("nvim_win_set_cursor", [0, [start.line + 1, start.character]]);
    await nvim.command("normal! v");
    await nvim.call("nvim_win_set_cursor", [0, [end.line + 1, Math.max(0, end.character - 1)]]);
    await nvim.command("normal! zz");
}
