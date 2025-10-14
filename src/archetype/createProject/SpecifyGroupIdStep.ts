// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { window } from "coc.nvim";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";

export class SpecifyGroupIdStep implements IProjectCreationStep {
    public previousStep?: IProjectCreationStep;
    public nextStep?: IProjectCreationStep;

    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        do {
            const userInput = await window.requestInput(
                "Specify GroupId of the project",
                metadata.groupId ?? (metadata.parentProject ? metadata.parentProject.groupId : "com.example")
            );
            metadata.groupId = userInput;
        } while (metadata.groupId === undefined || !this.groupIdValidation(metadata.groupId));
        return StepResult.NEXT;
    }

    private groupIdValidation(value: string): boolean {
        return /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/.test(value);
    }
}
