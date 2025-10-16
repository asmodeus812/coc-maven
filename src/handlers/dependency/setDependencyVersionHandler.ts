// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element, isTag, isText } from "domhandler";
import * as fse from "fs-extra";
import * as semver from "semver";
import * as coc from "coc.nvim";
import { Dependency } from "../../explorer/model/Dependency";
import { MavenProject } from "../../explorer/model/MavenProject";
import { MavenProjectManager } from "../../project/MavenProjectManager";
import {
    constructDependenciesNode,
    constructDependencyManagementNode,
    constructDependencyNode,
    getIndentation
} from "../../utils/editUtils";
import { UserError } from "../../utils/errorUtils";
import { getInnerEndIndex, getInnerStartIndex, getNodesByTag, XmlTagName } from "../../utils/lexerUtils";
import { getVersions } from "../../utils/requestUtils";
import { getDependencyNodeFromDependenciesNode } from "./utils";

export async function setDependencyVersionHandlerGeneric(param?: {
    projectPomPath: string;
    effectiveVersion: string;
    groupId: string;
    artifactId: string;
    fullText: string;
}): Promise<void> {
    // TODO: this is probably not the cleanest way to provide this bridge
    return setDependencyVersionHandler(param as unknown as Dependency);
}

export async function setDependencyVersionHandler(selectedItem: Dependency): Promise<void> {
    const pomPath: string = selectedItem.projectPomPath;
    const effectiveVersion = selectedItem.omittedStatus?.effectiveVersion ?? selectedItem.version;

    if (!pomPath || !(await fse.pathExists(pomPath))) {
        throw new UserError(`Specified POM ${pomPath} does not exist.`);
    }

    const gid: string = selectedItem.groupId;
    const aid: string = selectedItem.artifactId;
    const versions: string[] = getAllVersionsInTree(pomPath, gid, aid);
    const OPTION_SEARCH_MAVEN_CENTRAL = "Search Maven Central Repository...";
    versions.push(OPTION_SEARCH_MAVEN_CENTRAL);

    let selectedVersion: string | undefined = await coc.window
        .showQuickPick(
            versions.map((version) => ({
                value: version,
                label: version !== OPTION_SEARCH_MAVEN_CENTRAL ? `${version}` : version,
                description: version === effectiveVersion ? "effective" : undefined
            })),
            {
                placeHolder: `Select a version for ${gid}:${aid}...`
            }
        )
        .then((version) => (version ? version.value : undefined));
    if (selectedVersion === undefined) {
        return;
    }
    if (selectedVersion === OPTION_SEARCH_MAVEN_CENTRAL) {
        const selectedVersionFromMavenCentral: string | undefined = await coc.window
            .showQuickPick<coc.QuickPickItem & { value: string }>(
                getVersions(gid, aid).then((artifacts) =>
                    artifacts.map((artifact) => ({
                        value: artifact.v,
                        label: `${artifact.v}`,
                        description: artifact.v === effectiveVersion ? "effective" : undefined
                    }))
                ),
                {
                    placeHolder: `Select a version for ${gid}:${aid}...`
                }
            )
            .then((artifact) => (artifact ? artifact.value : undefined));
        if (selectedVersionFromMavenCentral === undefined) {
            return;
        }
        selectedVersion = selectedVersionFromMavenCentral;
    }
    if (selectedVersion !== effectiveVersion) {
        await setDependencyVersion(pomPath, gid, aid, selectedVersion);
    }
}

async function setDependencyVersion(pomPath: string, gid: string, aid: string, version: string): Promise<void> {
    const project: MavenProject | undefined = MavenProjectManager.get(pomPath);
    if (project === undefined) {
        throw new Error("Failed to resolve maven project.");
    }

    const baseDocument: coc.Document = await coc.workspace.openTextDocument(coc.Uri.file(pomPath));
    const pomDocument: coc.TextDocument = baseDocument.textDocument;
    const projectNodes: Element[] = getNodesByTag(pomDocument.getText(), XmlTagName.Project);
    if (projectNodes === undefined || projectNodes.length !== 1) {
        throw new UserError("Only support POM file with single <project> node.");
    }

    const projectNode: Element = projectNodes[0];
    const dependenciesNode: Element | undefined = projectNode.children.find(
        (elem) => isTag(elem) && elem.tagName === XmlTagName.Dependencies
    ) as Element | undefined;
    const dependencyManagementNode: Element | undefined = projectNode.children.find(
        (elem) => isTag(elem) && elem.tagName === XmlTagName.DependencyManagement
    ) as Element | undefined;
    // find ${gid:aid} dependency node in <dependencies> to delete
    const deleteNode = getDependencyNodeFromDependenciesNode(dependenciesNode, gid, aid, project);
    if (dependencyManagementNode !== undefined) {
        await insertDependencyManagement(pomPath, dependencyManagementNode, deleteNode, gid, aid, version);
    } else {
        await insertDependencyManagement(pomPath, projectNode, deleteNode, gid, aid, version);
    }
}

async function insertDependencyManagement(
    pomPath: string,
    targetNode: Element,
    deleteNode: Element | undefined,
    gid: string,
    aid: string,
    version: string
): Promise<void> {
    if (targetNode === undefined) {
        throw new UserError("Invalid target XML node to insert dependency management.");
    }
    const location: coc.Uri = coc.Uri.file(pomPath);
    await coc.commands.executeCommand("maven.project.resource.open", location);
    const baseDocument: coc.Document = await coc.workspace.openTextDocument(location);
    const currentDocument: coc.TextDocument = baseDocument.textDocument;
    const textEditor: coc.TextEditor = coc.window.activeTextEditor as coc.TextEditor;
    const baseIndent: string = getIndentation(currentDocument, getInnerEndIndex(targetNode));
    const options: coc.TextEditorOptions = textEditor.options;
    const indent: string = options.insertSpaces && typeof options.tabSize === "number" ? " ".repeat(options.tabSize) : "\t";
    const eol: string = process.platform !== "win32" ? "\n" : "\r\n";

    let insertPosition: coc.Position | undefined;
    let targetText: string;
    let dependencyNodeInManagement: Element | undefined;

    if (targetNode.tagName === XmlTagName.DependencyManagement) {
        const dependenciesNode: Element | undefined = targetNode?.children?.find(
            (node) => isTag(node) && node.tagName === XmlTagName.Dependencies
        ) as Element | undefined;
        if (dependenciesNode) {
            insertPosition = currentDocument.positionAt(getInnerStartIndex(dependenciesNode));
            // find ${gid:aid} dependency node that already in dependency management to delete
            dependencyNodeInManagement = dependenciesNode?.children?.find(
                (node) =>
                    isTag(node) &&
                    node.tagName === XmlTagName.Dependency &&
                    node.children?.find(
                        (id) =>
                            isTag(id) &&
                            id.tagName === XmlTagName.GroupId &&
                            id.firstChild &&
                            isText(id.firstChild) &&
                            id.firstChild.data === gid
                    ) &&
                    node.children?.find(
                        (id) =>
                            isTag(id) &&
                            id.tagName === XmlTagName.ArtifactId &&
                            id.firstChild &&
                            isText(id.firstChild) &&
                            id.firstChild.data === aid
                    )
            ) as Element | undefined;
            const newIndent = `${baseIndent}${indent}`;
            targetText = constructDependencyNode({ gid, aid, version, baseIndent: newIndent, indent, eol });
        } else {
            insertPosition = currentDocument.positionAt(getInnerStartIndex(targetNode));
            targetText = constructDependenciesNode({ gid, aid, version, baseIndent, indent, eol });
        }
    } else if (targetNode.tagName === XmlTagName.Project) {
        insertPosition = currentDocument.positionAt(getInnerEndIndex(targetNode));
        targetText = constructDependencyManagementNode({ gid, aid, version, baseIndent, indent, eol });
    } else {
        return;
    }

    const edit: coc.WorkspaceEdit = { changes: {} };
    edit.changes ??= {};
    if (deleteNode) {
        // the version of ${gid:aid} dependency node already imported should be deleted
        const versionNode: Element | undefined = deleteNode.children?.find((node) => isTag(node) && node.tagName === XmlTagName.Version) as
            | Element
            | undefined;
        if (versionNode && versionNode.startIndex !== null && versionNode.endIndex !== null) {
            const start: number = versionNode.startIndex;
            const end: number = versionNode.endIndex + 1;
            const range = coc.Range.create(currentDocument.positionAt(start), currentDocument.positionAt(end));
            const textEdit: coc.TextEdit = coc.TextEdit.del(range);
            edit.changes[currentDocument.uri] = [textEdit].concat(edit.changes[currentDocument.uri] || []);
        }
    }
    if (dependencyNodeInManagement && dependencyNodeInManagement.startIndex !== null && dependencyNodeInManagement.endIndex !== null) {
        // ${gid:aid} dependency node that already exists in <dependencyManagement> shoule be deleted
        const start: number = dependencyNodeInManagement.startIndex;
        const end: number = dependencyNodeInManagement.endIndex + 1;
        const range = coc.Range.create(currentDocument.positionAt(start), currentDocument.positionAt(end));
        const textEdit: coc.TextEdit = coc.TextEdit.del(range);
        edit.changes[currentDocument.uri] = [textEdit].concat(edit.changes[currentDocument.uri] || []);
    }

    const textEdit: coc.TextEdit = coc.TextEdit.insert(insertPosition, targetText);
    edit.changes[currentDocument.uri] = [textEdit].concat(edit.changes[currentDocument.uri] || []);
    await coc.workspace.applyEdit(edit);
}

function getAllVersionsInTree(pomPath: string, gid: string, aid: string): string[] {
    const project: MavenProject | undefined = MavenProjectManager.get(pomPath);
    if (project === undefined) {
        throw new Error("Failed to resolve maven projects.");
    }
    const fullText: string = project.fullText as string;
    const re = new RegExp(`${gid}:${aid}:[\\w.-]+`, "gm");
    const artifacts: string[] | null = RegExp(re).exec(fullText);
    let versions: string[] = [];
    if (artifacts !== null) {
        artifacts.forEach((a) => {
            versions.push(a.slice(gid.length + aid.length + 2));
        });
    }

    function compare(v1: string, v2: string): number {
        // correct versions that do not follow SemVer Policy
        const s1: semver.SemVer | null = semver.coerce(v1);
        const s2: semver.SemVer | null = semver.coerce(v2);
        const version1: semver.SemVer | string = s1 === null ? v1 : s1;
        const version2: semver.SemVer | string = s2 === null ? v2 : s2;
        return semver.rcompare(version1, version2, true);
    }

    versions = Array.from(new Set(versions)).sort(compare);
    return versions;
}
