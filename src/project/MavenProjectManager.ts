// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { MavenProject } from "../explorer/model/MavenProject";
import * as coc from "coc.nvim";
import * as path from "path";
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

    /**
     * Find a project by the path of its pom file, document uris (file://...) are accepted as well, since language feature
     * providers receive those from coc, while the projects are keyed by their file system path
     */
    public static get(pomPathOrUri: string): MavenProject | undefined {
        const pomPath: string = pomPathOrUri.startsWith("file:") ? coc.Uri.parse(pomPathOrUri).fsPath : pomPathOrUri;
        return MavenProjectManager.getInstance()._projectMap.get(pomPath);
    }

    /**
     * The projects that take part in a build: the roots, poms with no other pom in a folder above them, and the modules
     * the projects of a build list. Any other pom sits inside a project without being part of its build, such as the
     * test inputs or the samples of that project, maven runs in the background for those would only fail or go to waste
     */
    public static buildProjects(): Set<MavenProject> {
        const byPath: Map<string, MavenProject> = new Map(
            MavenProjectManager.projects.filter((p) => p.parsed).map((p) => [path.resolve(p.pomPath), p])
        );
        const folders: Set<string> = new Set(Array.from(byPath.keys()).map((pomPath) => path.dirname(pomPath)));
        const build: Set<MavenProject> = new Set();
        const pending: MavenProject[] = Array.from(byPath.entries())
            .filter(([pomPath]) => !hasFolderAbove(path.dirname(pomPath), folders))
            .map(([, project]) => project);
        while (pending.length > 0) {
            const project: MavenProject = pending.pop() as MavenProject;
            if (!build.has(project)) {
                build.add(project);
                project.buildModules.forEach((module) => {
                    const moduleProject: MavenProject | undefined = byPath.get(path.resolve(module));
                    if (moduleProject) {
                        pending.push(moduleProject);
                    }
                });
            }
        }
        return build;
    }

    public static update(...items: MavenProject[]): void {
        for (const item of items) {
            MavenProjectManager.getInstance()._projectMap.set(item.pomPath, item);
        }
    }

    public static async add(pomPath: string): Promise<void> {
        const newProject = new MavenProject(pomPath);
        MavenProjectManager.getInstance()._projectMap.set(pomPath, newProject);
        await newProject.parsePom();
    }

    public static remove(pomPath: string): void {
        MavenProjectManager.getInstance()._projectMap.delete(pomPath);
    }

    public static async removeAllFrom(folder: coc.WorkspaceFolder): Promise<void> {
        const pomPaths: string[] = await getAllPomPaths(folder);
        for (const pomPath of pomPaths) {
            MavenProjectManager.remove(pomPath);
        }
    }
}

// whether one of the folders is a parent folder of the folder
function hasFolderAbove(folder: string, folders: Set<string>): boolean {
    let current: string = path.dirname(folder);
    while (current !== folder && !folders.has(current)) {
        folder = current;
        current = path.dirname(folder);
    }
    return current !== folder;
}

async function getAllPomPaths(workspaceFolder?: coc.WorkspaceFolder): Promise<string[]> {
    if (!workspaceFolder) {
        if (coc.workspace.workspaceFolders) {
            const arrayOfPoms: string[][] = await Promise.all(coc.workspace.workspaceFolders.map(getAllPomPaths));
            return arrayOfPoms.flat();
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
