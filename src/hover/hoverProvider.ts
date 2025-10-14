// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element, isTag, Node } from "domhandler";
import * as coc from "coc.nvim";
import { getXsdElement } from "../mavenXsd";

import { MavenProject } from "../explorer/model/MavenProject";
import { MavenProjectManager } from "../project/MavenProjectManager";
import { getCurrentNode, getEnclosingTag, getNodePath, getTextFromNode, XmlTagName } from "../utils/lexerUtils";
import { isXmlExtensionEnabled } from "../utils/extensionUtils";

export class HoverProvider implements coc.HoverProvider {
    private readonly isXmlExtensionEnabled: boolean;

    constructor() {
        this.isXmlExtensionEnabled = isXmlExtensionEnabled();
    }

    public async provideHover(
        document: coc.TextDocument,
        position: coc.Position,
        _token: coc.CancellationToken
    ): Promise<coc.Hover | undefined> {
        const documentText: string = document.getText();
        const cursorOffset: number = document.offsetAt(position);
        const currentNode: Node | undefined = getCurrentNode(documentText, cursorOffset);
        if (currentNode === undefined || currentNode.startIndex === null || currentNode.endIndex === null) {
            return undefined;
        }

        const nodePath = getNodePath(currentNode);
        const xsdElement = getXsdElement(nodePath);

        const tagNode = getEnclosingTag(currentNode);

        switch (tagNode?.tagName) {
            case XmlTagName.GroupId:
            case XmlTagName.ArtifactId:
            case XmlTagName.Version: {
                const targetNode = tagNode.parent;
                const targetRange: coc.Range = coc.Range.create(
                    targetNode && targetNode.startIndex !== null ? document.positionAt(targetNode?.startIndex) : position,
                    targetNode && targetNode.endIndex !== null ? document.positionAt(targetNode?.endIndex) : position
                );

                const siblingNodes: Node[] = tagNode.parent?.children ?? [];
                const artifactIdNode: Element | undefined = siblingNodes.find(
                    (elem) => isTag(elem) && elem.tagName === XmlTagName.ArtifactId
                ) as Element;
                const groupIdNode: Element | undefined = siblingNodes.find(
                    (elem) => isTag(elem) && elem.tagName === XmlTagName.GroupId
                ) as Element;
                const groupIdHint = getTextFromNode(groupIdNode?.firstChild);
                const artifactIdHint = getTextFromNode(artifactIdNode?.firstChild);
                if (groupIdHint && artifactIdHint) {
                    const mavenProject: MavenProject | undefined = MavenProjectManager.get(document.uri);
                    if (!mavenProject) {
                        return undefined;
                    }
                    const effectiveVersion: string | undefined = mavenProject.getDependencyVersion(groupIdHint, artifactIdHint);
                    if (effectiveVersion) {
                        return {
                            contents: {
                                value: [`groupId = ${groupIdHint}`, `artifactId = ${artifactIdHint}`, `version = ${effectiveVersion}`].join(
                                    "\n\n"
                                ),
                                kind: coc.MarkupKind.PlainText
                            },
                            range: targetRange
                        } as coc.Hover;
                    }
                }
                return undefined;
            }
            default:
                // schema-based
                if (this.isXmlExtensionEnabled) {
                    // See: https://github.com/microsoft/vscode-maven/issues/918
                    return undefined;
                }
                return xsdElement
                    ? ({
                          contents: {
                              value: [xsdElement.nodePath.replace(/\./g, ">"), xsdElement.markdownString].join("\n"),
                              kind: coc.MarkupKind.PlainText
                          },
                          range: coc.Range.create(position, position)
                      } as coc.Hover)
                    : undefined;
        }
    }
}

export const hoverProvider: HoverProvider = new HoverProvider();
