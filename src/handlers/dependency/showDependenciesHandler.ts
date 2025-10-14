// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { MavenProject } from "../../explorer/model/MavenProject";
import { rawDependencyTree } from "../../utils/mavenUtils";
import { dependenciesContentUri } from "../../utils/uiUtils";

export async function showDependenciesHandler(project: MavenProject): Promise<void> {
    const uri = dependenciesContentUri(project.pomPath);
    await coc.commands.executeCommand("maven.project.resource.open", uri);
}

export async function getDependencyTree(pomPathOrMavenProject: string | MavenProject): Promise<string | undefined> {
    let pomPath: string;
    if (typeof pomPathOrMavenProject === "object" && pomPathOrMavenProject instanceof MavenProject) {
        const mavenProject: MavenProject = pomPathOrMavenProject;
        pomPath = mavenProject.pomPath;
    } else if (typeof pomPathOrMavenProject === "string") {
        pomPath = pomPathOrMavenProject;
    } else {
        return undefined;
    }

    const task = async (p: coc.Progress<{ message?: string }>) => {
        try {
            return await rawDependencyTree(pomPath);
        } catch (error) {
            throw error;
        }
    };
    return await coc.window.withProgress(
        {
            title: "Computing dependency tree..."
        },
        task
    );
}
