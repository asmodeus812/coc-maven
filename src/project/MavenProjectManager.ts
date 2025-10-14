// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { MavenProject } from "../explorer/model/MavenProject";
import * as coc from "coc.nvim";
import { Settings } from "../Settings";

export class MavenProjectManager {
    private static INSTANCE: MavenProjectManager;
    private readonly _projectMap: Map<string, MavenProject> = new Map();

    public static getInstance() {
        if (!this.INSTANCE) {
            this.INSTANCE = new MavenProjectManager();
        }
        return this.INSTANCE;
    }

    public static async loadProjects(workspaceFolder?: coc.WorkspaceFolder): Promise<MavenProject[]> {
        const newProjects: MavenProject[] = [];
        const allProjects: MavenProject[] = [];
        const pomPaths: string[] = await getAllPomPaths(workspaceFolder);

        for (const pomPath of pomPaths) {
            let currentProject: MavenProject | undefined = MavenProjectManager.get(pomPath);
            if (!currentProject) {
                currentProject = new MavenProject(pomPath);
                newProjects.push(currentProject);
            }
            allProjects.push(currentProject);
        }

        await Promise.all(newProjects.map(async (elem) => elem.parsePom()));
        MavenProjectManager.update(...newProjects);
        newProjects.forEach((p) => {
            p.modules.forEach((m) => {
                const moduleNode: MavenProject | undefined = MavenProjectManager.get(m);
                if (moduleNode && moduleNode.parent === undefined) {
                    moduleNode.parent = p;
                }
            });
        });
        return allProjects;
    }

    public static get projects(): MavenProject[] {
        return Array.from(MavenProjectManager.getInstance()._projectMap.values());
    }

    public static get current(): MavenProject | undefined {
        const projects: MavenProject[] = this.projects.filter((p) => p.pomPath.startsWith(coc.workspace.root));
        return projects?.length > 0 ? projects[0] : undefined;
    }

    public static get(pomPath: string): MavenProject | undefined {
        return MavenProjectManager.getInstance()._projectMap.get(pomPath);
    }

    public static update(...items: MavenProject[]): void {
        for (const item of items) {
            MavenProjectManager.getInstance()._projectMap.set(item.pomPath, item);
        }
    }

    public static add(pomPath: string): void {
        const newProject = new MavenProject(pomPath);
        newProject.parsePom();
        MavenProjectManager.getInstance()._projectMap.set(pomPath, newProject);
    }

    public static remove(pomPath: string): void {
        const projectMap = MavenProjectManager.getInstance()._projectMap;
        if (projectMap.has(pomPath)) {
            projectMap.delete(pomPath);
        }
    }

    public static async removeAllFrom(folder: coc.WorkspaceFolder): Promise<void> {
        const pomPaths: string[] = await getAllPomPaths(folder);
        for (const pomPath of pomPaths) {
            MavenProjectManager.remove(pomPath);
        }
    }
}

async function getAllPomPaths(workspaceFolder?: coc.WorkspaceFolder): Promise<string[]> {
    if (!workspaceFolder) {
        if (coc.workspace.workspaceFolders) {
            const arrayOfPoms: string[][] = await Promise.all(coc.workspace.workspaceFolders.map(getAllPomPaths));
            const result: string[] = [];
            for (const poms of arrayOfPoms) {
                result.push(...poms);
            }
            return result;
        } else {
            return [];
        }
    }
    const resource: coc.Uri = coc.Uri.parse(workspaceFolder.uri);
    const exclusions: string[] = Settings.excludedFolders(resource);
    const pattern: string = Settings.Pomfile.globPattern();
    const pomFileUris: coc.Uri[] = await coc.workspace.findFiles(
        new coc.RelativePattern(workspaceFolder, pattern),
        `{${exclusions.join(",")}}`
    );
    return pomFileUris.map((_uri) => _uri.fsPath);
}
