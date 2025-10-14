// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickPickItem, window } from "coc.nvim";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";

export class SpecifyArchetypeVersionStep implements IProjectCreationStep {
    public previousStep?: IProjectCreationStep;
    public nextStep?: IProjectCreationStep;

    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        if (!metadata.archetype) {
            if (this.nextStep) {
                this.nextStep.previousStep = this.previousStep;
            }
            return StepResult.NEXT;
        }

        if (metadata.archetype.versions === undefined) {
            return StepResult.STOP;
        }

        const selectedItem = await window.showQuickPick<QuickPickItem>(
            metadata.archetype.versions.map((version) => ({ label: version })),
            {
                title: metadata.title,
                placeholder: `Select version of ${metadata.archetypeArtifactId}`
            }
        );

        if (selectedItem === undefined) {
            return StepResult.STOP;
        }

        metadata.archetypeVersion = selectedItem.label;
        return StepResult.NEXT;
    }
}
