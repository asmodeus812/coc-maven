// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { window } from "coc.nvim";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";

export class SpecifyArtifactIdStep implements IProjectCreationStep {
    public previousStep?: IProjectCreationStep;

    public async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        do {
            const userInput = await window.requestInput(
                metadata.parentProject ? "Enter module name" : "Enter ArtifactId of the project",
                metadata.artifactId ?? "demo"
            );
            metadata.artifactId = userInput;
        } while (metadata.artifactId === undefined || !this.artifactIdValidation(metadata.artifactId));
        return StepResult.NEXT;
    }

    private artifactIdValidation(value: string): boolean {
        return /^[a-z_][a-z0-9_]*(-[a-z_][a-z0-9_]*)*$/.test(value);
    }
}
