// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { Element, isTag, Node } from "domhandler";
import { existsSync } from "fs";
import * as path from "path";
import { MavenProject } from "../explorer/model/MavenProject";
import { MavenProjectManager } from "../project/MavenProjectManager";
import { localPomPath, possibleLocalPomPath } from "../utils/contextUtils";
import { getCurrentNode, getEnclosingTag, getTextFromNode, XmlTagName } from "../utils/lexerUtils";

class DefinitionProvider implements coc.DefinitionProvider {
    public provideDefinition(
        document: coc.TextDocument,
        position: coc.Position,
        _token: coc.CancellationToken
    ): coc.ProviderResult<coc.Location | coc.Location[] | coc.LocationLink[]> {
        const documentText: string = document.getText();
        const cursorOffset: number = document.offsetAt(position);
        const currentNode: Node | undefined = getCurrentNode(documentText, cursorOffset);
        if (!currentNode || currentNode?.startIndex === null || currentNode?.endIndex === null) {
            return undefined;
        }

        const tagNode = getEnclosingTag(currentNode);

        switch (tagNode?.tagName) {
            case XmlTagName.GroupId:
            case XmlTagName.ArtifactId:
            case XmlTagName.Version: {
                const parentNode = tagNode.parent;
                if (!parentNode || !isTag(parentNode)) {
                    return undefined;
                }
                if (parentNode.name === XmlTagName.Dependency || parentNode.name === XmlTagName.Plugin) {
                    // plugin/dependency -> artifacts
                    return getDependencyDefinitionLink(parentNode, document, position);
                } else if (parentNode.name === XmlTagName.Parent) {
                    // parent -> artifact
                    return getParentDefinitionLink(parentNode, document, position);
                } else {
                    return undefined;
                }
            }
            case XmlTagName.Module: {
                return getModuleDefinitionLink(tagNode, document, position);
            }
            case XmlTagName.Parent: {
                return getParentDefinitionLink(tagNode, document, position);
            }
            case XmlTagName.Dependency:
            case XmlTagName.Plugin: {
                return getDependencyDefinitionLink(tagNode, document, position);
            }
            default:
                return undefined;
        }
    }
}

export const definitionProvider: DefinitionProvider = new DefinitionProvider();

function getParentDefinitionLinkFromRelativePath(parentNode: Element, document: coc.TextDocument, position: coc.Position) {
    const mavenProject: MavenProject | undefined = MavenProjectManager.get(document.uri);
    if (mavenProject) {
        const parentPomPath = mavenProject.parentPomPath;
        /**
         * TODO: Here only file existence is verified. In fact, groupId, artifactId, version in parent POM should also match those in project.parent node.
         */
        if (!parentPomPath || !existsSync(parentPomPath)) {
            return undefined;
        }

        const originSelectionRange: coc.Range = coc.Range.create(
            parentNode && parentNode.startIndex !== null ? document.positionAt(parentNode.startIndex) : position,
            parentNode && parentNode.endIndex !== null ? document.positionAt(parentNode.endIndex) : position
        );
        const definitionLink: coc.LocationLink = {
            targetRange: coc.Range.create(0, 0, 0, 0),
            targetUri: coc.Uri.file(parentPomPath).fsPath,
            originSelectionRange: originSelectionRange
        } as coc.LocationLink;
        return [definitionLink];
    }
    return undefined;
}

function getDependencyDefinitionLink(dependencyOrPluginNode: Element, document: coc.TextDocument, position: coc.Position) {
    const selectionRange: coc.Range = coc.Range.create(
        dependencyOrPluginNode.startIndex !== null ? document.positionAt(dependencyOrPluginNode.startIndex) : position,
        dependencyOrPluginNode.endIndex !== null ? document.positionAt(dependencyOrPluginNode.endIndex) : position
    );

    const siblingNodes: Node[] = dependencyOrPluginNode.children ?? [];
    const artifactIdNode: Element | undefined = siblingNodes.find(
        (elem) => isTag(elem) && elem.tagName === XmlTagName.ArtifactId
    ) as Element;
    const groupIdNode: Element | undefined = siblingNodes.find((elem) => isTag(elem) && elem.tagName === XmlTagName.GroupId) as Element;
    const versionNode: Element | undefined = siblingNodes.find((elem) => isTag(elem) && elem.tagName === XmlTagName.Version) as Element;

    const groupIdHint = getTextFromNode(groupIdNode?.firstChild);
    const artifactIdHint = getTextFromNode(artifactIdNode?.firstChild);
    const versionHint = getTextFromNode(versionNode?.firstChild);
    if (groupIdHint && artifactIdHint) {
        const mavenProject: MavenProject | undefined = MavenProjectManager.get(document.uri);
        const version: string | undefined = mavenProject?.getDependencyVersion(groupIdHint, artifactIdHint) || versionHint;
        if (version !== undefined) {
            const pomPath: string = localPomPath(groupIdHint, artifactIdHint, version);
            if (existsSync(pomPath)) {
                const definitionLink: coc.LocationLink = {
                    targetRange: coc.Range.create(0, 0, 0, 0),
                    targetUri: coc.Uri.file(pomPath).with({ scheme: "coc-maven", authority: "local-repository" }).fsPath,
                    originSelectionRange: selectionRange
                } as coc.LocationLink;
                return [definitionLink];
            } else {
                // provide all local version under gid:aid
                const links: coc.DefinitionLink[] = [];
                const pomPaths = possibleLocalPomPath(groupIdHint, artifactIdHint);
                for (const p of pomPaths) {
                    if (existsSync(p)) {
                        links.push({
                            targetRange: coc.Range.create(0, 0, 0, 0),
                            targetUri: coc.Uri.file(p).with({ scheme: "coc-maven", authority: "local-repository" }).fsPath,
                            originSelectionRange: selectionRange
                        } as coc.LocationLink);
                    }
                }
                return links;
            }
        }
    }
    return undefined;
}

function getModuleDefinitionLink(moduleNode: Element, document: coc.TextDocument, position: coc.Position) {
    const moduleName = getTextFromNode(moduleNode.firstChild);
    const targetUri = path.join(coc.Uri.parse(document.uri).fsPath, "..", moduleName, "pom.xml");
    const selectionRange: coc.Range = coc.Range.create(
        moduleNode && moduleNode.startIndex !== null ? document.positionAt(moduleNode.startIndex) : position,
        moduleNode && moduleNode.endIndex !== null ? document.positionAt(moduleNode.endIndex) : position
    );
    const definitionLink: coc.LocationLink = {
        targetRange: coc.Range.create(0, 0, 0, 0),
        targetUri,
        originSelectionRange: selectionRange
    } as coc.LocationLink;
    return [definitionLink];
}

/**
 * Definition of artifact specified in <parent> node.
 * 0. By default, the search order is relativePath > local repository > remote repository.
 * 1. if <relativePath> is explicitly empty, it's forbidden to search in relative path.
 */
function getParentDefinitionLink(parentNode: Element, document: coc.TextDocument, position: coc.Position) {
    const relativePathNode: Element | undefined = parentNode.childNodes.find(
        (ch) => isTag(ch) && ch.name === XmlTagName.RelativePath
    ) as Element;

    if (relativePathNode && !relativePathNode.firstChild) {
        // <relativePath/> to explicitly lookup parent from repository
        return getDependencyDefinitionLink(parentNode, document, position);
    } else {
        return (
            getParentDefinitionLinkFromRelativePath(parentNode, document, position) ??
            getDependencyDefinitionLink(parentNode, document, position)
        ); // fallback to search local repository if not found in relative path.
    }
}
