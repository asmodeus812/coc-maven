// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Element, isTag, Node } from "domhandler";
import * as _ from "lodash";
import * as coc from "coc.nvim";
import { getTextFromNode, XmlTagName } from "../../utils/lexerUtils";
import { FromCentral } from "./artifact/FromCentral";
import { FromIndex } from "./artifact/FromIndex";
import { FromLocal } from "./artifact/FromLocal";
import { IXmlCompletionProvider } from "./IXmlCompletionProvider";

const DEFAULT_GROUP_ID = "org.apache.maven.plugins";

export class ArtifactProvider implements IXmlCompletionProvider {
    private readonly centralProvider: FromCentral;
    private readonly indexProvider: FromIndex;
    private readonly localProvider: FromLocal;
    constructor() {
        this.centralProvider = new FromCentral();
        this.indexProvider = new FromIndex();
        this.localProvider = new FromLocal();
    }

    async provide(document: coc.TextDocument, position: coc.Position, currentNode: Node): Promise<coc.CompletionItem[]> {
        let tagNode: Element | undefined;
        if (isTag(currentNode)) {
            tagNode = currentNode;
        } else if (currentNode.parent && isTag(currentNode.parent)) {
            tagNode = currentNode.parent;
        } else {
            // TODO: should we recursively traverse up to find nearest tag node?
            return [];
        }

        switch (tagNode.tagName) {
            case XmlTagName.GroupId: {
                const groupIdTextNode = tagNode.firstChild;
                const targetRange: coc.Range | undefined = getRange(groupIdTextNode, document, position);
                if (!targetRange) {
                    return [];
                }

                const siblingNodes: Node[] = tagNode.parent?.children ?? [];
                const artifactIdNode: Element | undefined = siblingNodes.find(
                    (elem) => isTag(elem) && elem.tagName === XmlTagName.ArtifactId
                ) as Element;
                const artifactIdTextNode = artifactIdNode?.firstChild;

                const groupIdHint: string = getTextFromNode(groupIdTextNode);
                const artifactIdHint: string = getTextFromNode(artifactIdTextNode);

                const centralItems: coc.CompletionItem[] = await this.centralProvider.getGroupIdCandidates(groupIdHint, artifactIdHint);
                const indexItems: coc.CompletionItem[] = await this.indexProvider.getGroupIdCandidates(groupIdHint, artifactIdHint);
                const localItems: coc.CompletionItem[] = await this.localProvider.getGroupIdCandidates(groupIdHint);
                const mergedItems: coc.CompletionItem[] = _.unionBy(
                    centralItems,
                    indexItems,
                    localItems,
                    (item: coc.CompletionItem) => item.insertText
                );
                mergedItems.forEach((item) => (item.textEdit = { range: targetRange } as coc.TextEdit));
                return mergedItems;
            }
            case XmlTagName.ArtifactId: {
                const artifactIdTextNode = tagNode.firstChild;
                const targetRange: coc.Range | undefined = getRange(artifactIdTextNode, document, position);
                if (!targetRange) {
                    return [];
                }

                const siblingNodes: Node[] = tagNode.parent?.children ?? [];
                const groupIdNode: Element | undefined = siblingNodes.find(
                    (elem) => isTag(elem) && elem.tagName === XmlTagName.GroupId
                ) as Element;
                const groupIdTextNode = groupIdNode?.firstChild;

                const groupIdHint: string = getTextFromNode(groupIdTextNode);
                const artifactIdHint: string = getTextFromNode(artifactIdTextNode);

                const centralItems: coc.CompletionItem[] = await this.centralProvider.getArtifactIdCandidates(groupIdHint, artifactIdHint);
                const indexItems: coc.CompletionItem[] = await this.indexProvider.getArtifactIdCandidates(groupIdHint, artifactIdHint);
                const localItems: coc.CompletionItem[] = await this.localProvider.getArtifactIdCandidates(groupIdHint);
                let mergedItems: coc.CompletionItem[] = [];

                const ID_SEPARATOR = ":";
                mergedItems = _.unionBy(
                    centralItems,
                    indexItems,
                    localItems,
                    (item: coc.CompletionItem) => _.get(item, "data.groupId") + ID_SEPARATOR + item.insertText
                );
                mergedItems = dedupItemsWithGroupId(mergedItems, groupIdHint);

                // also update corresponding groupId node
                if (groupIdTextNode && groupIdTextNode.startIndex !== null && groupIdTextNode.endIndex !== null) {
                    for (const item of mergedItems) {
                        const matchedGroupId: string | undefined = _.get(item, "data.groupId");
                        if (matchedGroupId) {
                            const groupIdRange: coc.Range | undefined = getRange(groupIdTextNode, document);
                            if (groupIdRange) {
                                item.additionalTextEdits = [{ range: groupIdRange, newText: matchedGroupId } as coc.TextEdit];
                            }
                        }
                    }
                }
                mergedItems.forEach((item) => (item.textEdit = { range: targetRange } as coc.TextEdit));
                return mergedItems;
            }
            case XmlTagName.Version: {
                const versionTextNode = tagNode.firstChild;
                const targetRange: coc.Range | undefined = getRange(versionTextNode, document, position);
                if (!targetRange) {
                    return [];
                }

                const siblingNodes: Node[] = tagNode.parent?.children ?? [];
                const groupIdNode: Element | undefined = siblingNodes.find((elem) => isTag(elem) && elem.tagName === XmlTagName.GroupId) as
                    | Element
                    | undefined;
                const artifactIdNode: Element | undefined = siblingNodes.find(
                    (elem) => isTag(elem) && elem.tagName === XmlTagName.ArtifactId
                ) as Element | undefined;

                const groupIdHint: string = getTextFromNode(groupIdNode?.firstChild, DEFAULT_GROUP_ID);
                const artifactIdHint: string = getTextFromNode(artifactIdNode?.firstChild);
                if (!groupIdHint || !artifactIdHint) {
                    return [];
                }

                const centralItems: coc.CompletionItem[] = await this.centralProvider.getVersionCandidates(groupIdHint, artifactIdHint);
                const indexItems: coc.CompletionItem[] = await this.indexProvider.getVersionCandidates(groupIdHint, artifactIdHint);
                const localItems: coc.CompletionItem[] = await this.localProvider.getVersionCandidates(groupIdHint, artifactIdHint);
                const mergedItems: coc.CompletionItem[] = _.unionBy(centralItems, indexItems, localItems, (item) => item.insertText);
                mergedItems.forEach((item) => (item.textEdit = { range: targetRange } as coc.TextEdit));
                return mergedItems;
            }
        }
        return [];
    }
}

function getRange(node: Node | null, document: coc.TextDocument, fallbackPosition?: coc.Position) {
    if (fallbackPosition) {
        return coc.Range.create(
            node?.startIndex ? document.positionAt(node.startIndex) : fallbackPosition,
            node?.endIndex ? document.positionAt(node.endIndex + 1) : fallbackPosition
        );
    } else if (node?.startIndex !== null && node?.endIndex !== null) {
        return coc.Range.create(document.positionAt(node?.startIndex as number), document.positionAt((node?.endIndex as number) + 1));
    } else {
        return undefined;
    }
}

function dedupItemsWithGroupId(items: coc.CompletionItem[], groupId: string): coc.CompletionItem[] {
    const itemsWithGivenGroupId: coc.CompletionItem[] = items.filter((item) => _.get(item, "data.groupId") === groupId);
    const reservedArtifactIds: (string | coc.SnippetString | undefined)[] = itemsWithGivenGroupId.map((item) => item.insertText);
    const dedupedItems = items.filter((item) => !reservedArtifactIds.includes(item.insertText));
    return itemsWithGivenGroupId.concat(dedupedItems);
}
