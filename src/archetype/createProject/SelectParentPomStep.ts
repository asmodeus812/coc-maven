import { pathExistsSync } from "fs-extra";
import { Disposable, QuickPick, QuickPickItem, window } from "coc.nvim";
import { MavenProjectManager } from "../../project/MavenProjectManager";
import { IProjectCreationMetadata, IProjectCreationStep, StepResult } from "./types";
import { MavenProject } from "../../explorer/model/MavenProject";

interface ParentPomPickItem extends QuickPickItem {
    parentProject?: MavenProject;
}

export class SelectParentPom implements IProjectCreationStep {
    previousStep?: IProjectCreationStep;

    async run(metadata: IProjectCreationMetadata): Promise<StepResult> {
        const items: ParentPomPickItem[] = [
            {
                label: "<None>",
                parentProject: undefined
            }
        ];

        MavenProjectManager.projects
            .filter((project) => project.pomPath && pathExistsSync(project.pomPath))
            .map((project) => {
                if (!project.artifactId) {
                    // reload pom contents
                    project.parsePom();
                }

                return project;
            })
            .filter((project) => project.artifactId && project.groupId)
            .sort((a, b) => a.pomPath.length - b.pomPath.length)
            .forEach((project) => {
                items.push({
                    label: project.artifactId,
                    description: project.pomPath,
                    parentProject: project
                });
            });

        do {
            const selectedItem = await window.showQuickPick<ParentPomPickItem>(items, {
                title: metadata.title,
                placeholder: "Select the parent...",
                matchOnDescription: true
            });

            if (selectedItem === undefined) {
                return StepResult.STOP;
            }

            metadata.groupId = metadata.parentProject?.groupId;
            metadata.parentProject = selectedItem.parentProject;
        } while (metadata.parentProject === undefined);
        return StepResult.NEXT;
    }
}
