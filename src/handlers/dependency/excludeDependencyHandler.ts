// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element, isTag } from "domhandler";
import * as fse from "fs-extra";
import * as coc from "coc.nvim";
import { Dependency } from "../../explorer/model/Dependency";
import { getBaseIndentation, getInnerIndentation } from "../../utils/editUtils";
import { UserError } from "../../utils/errorUtils";
import { getInnerEndIndex, getInnerStartIndex, XmlTagName } from "../../utils/lexerUtils";
import { getDependencyNode } from "./utils";

export async function excludeDependencyHandler(toExclude?: Dependency): Promise<void> {
    if (toExclude === undefined) {
        throw new UserError("Only Dependency can be excluded.");
    }
    const root: Dependency = toExclude.root as Dependency;
    if (root === undefined || toExclude.fullArtifactName === root.fullArtifactName) {
        coc.window.showInformationMessage("The dependency written in pom can not be excluded.");
        return;
    }
    const pomPath: string = toExclude.projectPomPath;
    if (!(await fse.pathExists(pomPath))) {
        throw new UserError(`Specified POM ${pomPath} does not exist.`);
    }
    await excludeDependency(pomPath, toExclude.groupId, toExclude.artifactId, root.groupId, root.artifactId);
}

async function excludeDependency(pomPath: string, gid: string, aid: string, rootGid: string, rootAid: string): Promise<void> {
    // find out <dependencies> node with artifactId === rootAid and insert <exclusions> node
    const dependencyNode = await getDependencyNode(pomPath, rootGid, rootAid);
    if (dependencyNode === undefined) {
        throw new Error(`Failed to find dependency where ${gid}:${aid} is introduced.`);
    } else {
        await insertExcludeDependency(pomPath, dependencyNode, gid, aid);
    }
}

async function insertExcludeDependency(pomPath: string, targetNode: Element, gid: string, aid: string): Promise<void> {
    if (targetNode.children.length === 0) {
        throw new UserError("Invalid XML node, unable to exclude dependency");
    }
    const location: coc.Uri = coc.Uri.file(pomPath);
    await coc.commands.executeCommand("maven.project.resource.open", location);
    const baseDocument: coc.Document = await coc.workspace.openTextDocument(location);
    const currentDocument: coc.TextDocument = baseDocument.textDocument;
    const baseIndent: string = getBaseIndentation(currentDocument, getInnerEndIndex(targetNode));
    const indent: string = getInnerIndentation(location);
    const eol: string = process.platform !== "win32" ? "\n" : "\r\n";

    let insertPosition: coc.Position;
    let targetText: string;

    const exclusionNode: Element | undefined = targetNode.children?.find(
        (node) => isTag(node) && node.tagName === XmlTagName.Exclusions
    ) as Element | undefined;
    if (exclusionNode === undefined) {
        insertPosition = currentDocument.positionAt(getInnerEndIndex(targetNode));
        targetText = constructExclusionsNode(gid, aid, baseIndent, indent, eol);
    } else {
        insertPosition = currentDocument.positionAt(getInnerStartIndex(exclusionNode));
        targetText = constructExclusionNode(gid, aid, baseIndent, indent, eol);
    }

    const edit: coc.WorkspaceEdit = { changes: {} };
    const textEdit: coc.TextEdit = coc.TextEdit.insert(insertPosition, targetText);
    edit.changes ??= {};
    edit.changes[currentDocument.uri] = [textEdit];
    await coc.workspace.applyEdit(edit);
}

function constructExclusionsNode(gid: string, aid: string, baseIndent: string, indent: string, eol: string): string {
    return [
        `${indent}<exclusions>`,
        `${indent}<exclusion>`,
        `${indent}${indent}<artifactId>${aid}</artifactId>`,
        `${indent}${indent}<groupId>${gid}</groupId>`,
        `${indent}</exclusion>`,
        `</exclusions>${eol}${baseIndent}`
    ].join(`${eol}${baseIndent}${indent}`);
}

function constructExclusionNode(gid: string, aid: string, baseIndent: string, indent: string, eol: string): string {
    return [
        `${eol}${baseIndent}${indent}${indent}<exclusion>`,
        `${indent}${indent}<artifactId>${aid}</artifactId>`,
        `${indent}${indent}<groupId>${gid}</groupId>`,
        `${indent}</exclusion>`
    ].join(`${eol}${baseIndent}${indent}`);
}
