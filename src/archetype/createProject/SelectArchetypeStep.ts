// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickPickItem, window } from "coc.nvim";
import * as fse from "fs-extra";
import * as path from "path";
import { getMavenLocalRepository, getPathToExtensionRoot } from "../../utils/contextUtils";
import { Archetype } from "../Archetype";
import { ArchetypeModule } from "../ArchetypeModule";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";

interface IArchetypePickItem extends QuickPickItem {
    archetype?: Archetype;
}

const LABEL_NO_ARCHETYPE = "No Archetype";
const LABEL_MORE = "List all";

export class SelectArchetypeStep implements IProjectCreationStep {
    /**
     * This has to be the first step, no back buttons provided for previous steps.
     */
    public readonly previousStep: undefined;

    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        let seeAll: boolean = false;
        do {
            let items = await this.getArchetypePickItems(seeAll);
            const selectedItem = await window.showQuickPick<IArchetypePickItem>(items, {
                placeholder: "Select an archetype ...",
                matchOnDescription: true,
                canPickMany: false,
                title: metadata.title
            });

            if (!selectedItem || selectedItem === undefined) {
                return StepResult.STOP;
            }
            if (selectedItem.label === LABEL_NO_ARCHETYPE) {
                return StepResult.NEXT;
            }
            if (selectedItem.label === LABEL_MORE) {
                seeAll = true;
                continue;
            }
            metadata.archetypeArtifactId = selectedItem.archetype?.artifactId;
            metadata.archetypeGroupId = selectedItem.archetype?.groupId;
            metadata.archetype = selectedItem.archetype;
        } while (metadata.archetype === undefined);
        return StepResult.NEXT;
    }

    private async getArchetypePickItems(all?: boolean): Promise<IArchetypePickItem[]> {
        const noArchetypeButton: IArchetypePickItem = {
            label: LABEL_NO_ARCHETYPE,
            description: ""
        };
        const moreButton: IArchetypePickItem = {
            label: LABEL_MORE,
            description: ""
        };
        const archetypes = await this.loadArchetypePickItems(all);
        const pickItems = archetypes.map((archetype) => ({
            archetype,
            label: archetype.artifactId ? `${archetype.artifactId} ` : "",
            description: archetype.groupId ? `${archetype.groupId}` : ""
            // detail: archetype.description
        }));
        return all ? pickItems : [noArchetypeButton, moreButton, ...pickItems];
    }

    private async loadArchetypePickItems(all?: boolean): Promise<Archetype[]> {
        // from local catalog
        const localItems: Archetype[] = await this.getLocalArchetypeItems();
        // from cached remote-catalog
        const remoteItems: Archetype[] = await this.getCachedRemoteArchetypeItems();
        const localOnlyItems: Archetype[] = localItems.filter(
            (localItem) => !remoteItems.find((remoteItem) => remoteItem.identifier === localItem.identifier)
        );
        if (all) {
            return [...localOnlyItems, ...remoteItems];
        } else {
            const recommendedItems: Archetype[] = await this.getRecommendedItems(remoteItems);
            return [...localOnlyItems, ...recommendedItems];
        }
    }

    private async getRecommendedItems(allItems: Archetype[]): Promise<Archetype[]> {
        // Top popular archetypes according to usage data
        let fixedList: string[] | undefined;
        try {
            fixedList = await fse.readJSON(path.join(getPathToExtensionRoot(), "resources", "popular_archetypes.json"));
        } catch (error) {
            console.error(error);
        }
        if (!fixedList) {
            return [];
        } else {
            return fixedList
                .map((fullname: string) => allItems.find((item: Archetype) => fullname === `${item.groupId}:${item.artifactId}`))
                .filter(Boolean) as Archetype[];
        }
    }

    private async getLocalArchetypeItems(): Promise<Archetype[]> {
        const localCatalogPath: string = path.join(getMavenLocalRepository(), "archetype-catalog.xml");
        if (await fse.pathExists(localCatalogPath)) {
            const buf: Buffer = await fse.readFile(localCatalogPath);
            return ArchetypeModule.listArchetypeFromXml(buf.toString());
        } else {
            return [];
        }
    }

    private async getCachedRemoteArchetypeItems(): Promise<Archetype[]> {
        const contentPath: string = getPathToExtensionRoot("resources", "archetypes.json");
        if (await fse.pathExists(contentPath)) {
            return (await fse.readJSON(contentPath)).map(
                (rawItem: Archetype) =>
                    new Archetype(rawItem.artifactId, rawItem.groupId, rawItem.repository, rawItem.description, rawItem.versions)
            );
        } else {
            return [];
        }
    }
}
