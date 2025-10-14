// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { getArtifacts, getVersions, IArtifactMetadata, IVersionMetadata } from "../../../utils/requestUtils";
import { COMMAND_COMPLETION_ITEM_SELECTED, INFO_COMPLETION_ITEM_SELECTED } from "../../constants";
import { IArtifactCompletionProvider } from "./IArtifactProvider";
import { getSortText } from "../../utils";

export class FromCentral implements IArtifactCompletionProvider {
    public async getGroupIdCandidates(groupIdHint: string, artifactIdHint: string): Promise<coc.CompletionItem[]> {
        const keywords: string[] = [...groupIdHint.split("."), ...artifactIdHint.split("-")];
        const docs: IArtifactMetadata[] = await getArtifacts(keywords);
        const groupIds: string[] = Array.from(new Set(docs.map((doc) => doc.g)).values());
        const commandOnSelection: coc.Command = {
            title: "selected",
            command: COMMAND_COMPLETION_ITEM_SELECTED,
            arguments: [{ infoName: INFO_COMPLETION_ITEM_SELECTED, completeFor: "groupId", source: "maven-central" }]
        };
        return groupIds.map((gid) => {
            const item: coc.CompletionItem = {
                label: gid,
                insertText: gid,
                detail: "From Central Repository",
                command: commandOnSelection,
                kind: coc.CompletionItemKind.Module
            } as coc.CompletionItem;
            return item;
        });
    }

    public async getArtifactIdCandidates(groupIdHint: string, artifactIdHint: string): Promise<coc.CompletionItem[]> {
        const keywords: string[] = [...groupIdHint.split("."), ...artifactIdHint.split("-")];
        const docs: IArtifactMetadata[] = await getArtifacts(keywords);
        const commandOnSelection: coc.Command = {
            title: "selected",
            command: COMMAND_COMPLETION_ITEM_SELECTED,
            arguments: [{ infoName: INFO_COMPLETION_ITEM_SELECTED, completeFor: "artifactId", source: "maven-central" }]
        };
        return docs.map((doc) => {
            const item: coc.CompletionItem = {
                label: doc.a,
                description: doc.g,
                kind: coc.CompletionItemKind.Field,
                insertText: doc.a,
                detail: `GroupId: ${doc.g}`,
                command: commandOnSelection,
                data: { groupId: doc.g }
            } as coc.CompletionItem;
            return item;
        });
    }

    public async getVersionCandidates(groupId: string, artifactId: string): Promise<coc.CompletionItem[]> {
        if (!groupId && !artifactId) {
            return [];
        }

        const docs: IVersionMetadata[] = await getVersions(groupId, artifactId);
        const commandOnSelection: coc.Command = {
            title: "selected",
            command: COMMAND_COMPLETION_ITEM_SELECTED,
            arguments: [{ infoName: INFO_COMPLETION_ITEM_SELECTED, completeFor: "version", source: "maven-central" }]
        };
        return docs.map((doc) => {
            const updateDate = `Updated: ${new Date(doc.timestamp).toLocaleDateString()}`;
            const item: coc.CompletionItem = {
                label: doc.v,
                description: updateDate,
                insertText: doc.v,
                detail: updateDate,
                sortText: getSortText(doc.v),
                command: commandOnSelection,
                kind: coc.CompletionItemKind.Constant
            } as coc.CompletionItem;
            return item;
        });
    }
}
