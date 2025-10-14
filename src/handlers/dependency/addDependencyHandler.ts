// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { Element, isTag } from "domhandler";
import * as fse from "fs-extra";
import * as path from "path";
import { constructDependenciesNode, constructDependencyNode, getIndentation } from "../../utils/editUtils";
import { UserError } from "../../utils/errorUtils";
import { getInnerEndIndex, getInnerStartIndex, getNodesByTag, XmlTagName } from "../../utils/lexerUtils";
import { getArtifacts, IArtifactMetadata } from "../../utils/requestUtils";
import { getUsage } from "./artifactUsage";

export async function addDependencyHandler(options?: any): Promise<void> {
    let pomPath: string;
    if (options?.pomPath) {
        // for nodes from Maven explorer
        pomPath = options.pomPath;
    } else if (options?.projectBasePath) {
        // for "Maven dependencies" nodes from Project Manager
        pomPath = path.join(options.projectBasePath, "pom.xml");
    } else if (options?.project?.pomPath) {
        // for "Dependencies" node from module in Maven explorer
        pomPath = options.project.pomPath;
    } else {
        return;
    }

    if (!(await fse.pathExists(pomPath))) {
        throw new UserError(`Specified POM ${pomPath} does not exist.`);
    }

    const keywordString: string | undefined = await coc.window.requestInput("Search Maven Central Repository", "", {
        placeholder: "e.g. spring azure storage"
    });
    if (!keywordString) {
        return;
    }

    const selectedDoc: IArtifactMetadata | undefined = await coc.window
        .showQuickPick<coc.QuickPickItem & { value: IArtifactMetadata }>(
            getArtifacts(keywordString.trim().split(/[-,. :]/)).then(
                (artifacts) =>
                    artifacts
                        .map((artifact) => ({
                            value: artifact,
                            label: `${artifact.a}`,
                            description: artifact.g,
                            usage: getUsage(`${artifact.g}:${artifact.a}`) // load usage data
                        }))
                        .sort((a, b) => b.usage - a.usage) // from largest to smallest
            ),
            {
                placeHolder: "Select a dependency...",
                matchOnDescription: true
            }
        )
        .then((selected) => selected?.value);
    if (!selectedDoc) {
        return;
    }
    await addDependency(pomPath, selectedDoc.g, selectedDoc.a, selectedDoc.latestVersion, selectedDoc.p);
}

async function addDependency(
    pomPath: string,
    gid: string,
    aid: string,
    version?: string,
    dependencyType?: string,
    classifier?: string
): Promise<void> {
    const baseDocument: coc.Document = await coc.workspace.openTextDocument(coc.Uri.file(pomPath));
    const currentDocument: coc.TextDocument = baseDocument.textDocument;
    const projectNodes: Element[] = getNodesByTag(currentDocument.getText(), XmlTagName.Project);
    if (projectNodes === undefined || projectNodes.length !== 1) {
        throw new UserError("Only support POM file with single <project> node.");
    }

    const projectNode: Element = projectNodes[0];
    const dependenciesNode: Element | undefined = projectNode.children.find(
        (elem) => isTag(elem) && elem.tagName === XmlTagName.Dependencies
    ) as Element;
    if (dependenciesNode !== undefined) {
        await insertDependency(pomPath, dependenciesNode, gid, aid, version, dependencyType, classifier);
    } else {
        await insertDependency(pomPath, projectNode, gid, aid, version, dependencyType, classifier);
    }
}

async function insertDependency(
    pomPath: string,
    targetNode: Element,
    gid: string,
    aid: string,
    version?: string,
    dependencyType?: string,
    classifier?: string
): Promise<void> {
    const baseDocument: coc.Document = await coc.workspace.openTextDocument(coc.Uri.file(pomPath));
    const currentDocument: coc.TextDocument = baseDocument.textDocument;
    const baseIndent: string = getIndentation(currentDocument, getInnerEndIndex(targetNode));
    const textEditor: coc.TextEditor = coc.window.activeTextEditor as coc.TextEditor;
    const options: coc.TextEditorOptions = textEditor.options;
    const indent: string = options.insertSpaces && typeof options.tabSize === "number" ? " ".repeat(options.tabSize) : "\t";
    const eol: string = process.platform !== "win32" ? "\n" : "\r\n";
    let insertPosition: coc.Position;
    let targetText: string;
    if (targetNode.tagName === XmlTagName.Dependencies) {
        insertPosition = currentDocument.positionAt(getInnerStartIndex(targetNode));
        targetText = constructDependencyNode({ gid, aid, version, dtype: dependencyType, classifier, baseIndent, indent, eol });
    } else if (targetNode.tagName === XmlTagName.Project) {
        insertPosition = currentDocument.positionAt(getInnerEndIndex(targetNode));
        targetText = constructDependenciesNode({ gid, aid, version, dtype: dependencyType, classifier, baseIndent, indent, eol });
    } else {
        return;
    }

    const edit: coc.WorkspaceEdit = { changes: {} };
    const textEdit: coc.TextEdit = coc.TextEdit.insert(insertPosition, targetText);
    edit.changes ??= {};
    edit.changes[currentDocument.uri] = [textEdit];
    await coc.workspace.applyEdit(edit);
}
