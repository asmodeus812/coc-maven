// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

"use strict";
import * as coc from "coc.nvim";
import * as path from "path";
import { Progress, Uri, nvim } from "coc.nvim";
import { diagnosticProvider } from "./DiagnosticProvider";
import { Settings } from "./Settings";
import { ArchetypeModule } from "./archetype/ArchetypeModule";
import { codeActionProvider } from "./codeAction/codeActionProvider";
import { ConflictResolver, conflictResolver } from "./codeAction/conflictResolver";
import { completionProvider } from "./completion/PomCompletionProvider";
import { COMMAND_COMPLETION_ITEM_SELECTED, DEFAULT_MAVEN_LIFECYCLES } from "./completion/constants";
import { contentProvider } from "./contentProvider";
import { definitionProvider } from "./definition/definitionProvider";
import { MavenExplorerProvider } from "./explorer/MavenExplorerProvider";
import { Dependency } from "./explorer/model/Dependency";
import { LifecyclePhase } from "./explorer/model/LifecyclePhase";
import { MavenProfile } from "./explorer/model/MavenProfile";
import { MavenProject } from "./explorer/model/MavenProject";
import { PluginGoal } from "./explorer/model/PluginGoal";
import { pluginInfoProvider } from "./explorer/pluginInfoProvider";
import { addDependencyHandler } from "./handlers/dependency/addDependencyHandler";
import { excludeDependencyHandler } from "./handlers/dependency/excludeDependencyHandler";
import { goToEffectiveHandler } from "./handlers/dependency/goToEffectiveHandler";
import { jumpToDefinitionHandler } from "./handlers/dependency/jumpToDefinitionHandler";
import { setDependencyVersionHandler, setDependencyVersionHandlerGeneric } from "./handlers/dependency/setDependencyVersionHandler";
import { showDependenciesHandler } from "./handlers/dependency/showDependenciesHandler";
import { addFavoriteHandler } from "./handlers/favorites/addFavoriteHandler";
import { runFavoriteCommandsHandler } from "./handlers/favorites/runFavoriteCommandsHandler";
import { executeLifecyclePhaseHandler } from "./handlers/lifecycle/executeLifecyclePhaseHandler";
import { hoverProvider } from "./hover/hoverProvider";
import { registerArtifactSearcher } from "./jdtls/artifactSearcher";
import { isJavaExtEnabled } from "./jdtls/commands";
import { mavenOutputChannel } from "./mavenOutputChannel";
import { registerHelp } from "./help";
import { mavenTerminal } from "./mavenTerminal";
import { init as initMavenXsd } from "./mavenXsd";
import { MavenProjectManager } from "./project/MavenProjectManager";
import { taskExecutor } from "./taskExecutor";
import { Utils } from "./utils/Utils";
import { loadMavenSettingsFilePath, loadPackageInfo } from "./utils/contextUtils";
import { executeInTerminal } from "./utils/mavenUtils";
import { dependenciesContentUri, effectivePomContentUri, registerCommand, selectProjectIfNecessary } from "./utils/uiUtils";
import { focusResourceLocation } from "./utils/editUtils";

const POM_REFRESH_DELAY_MS = 1000;

export async function activate(context: coc.ExtensionContext): Promise<void> {
    registerHelp(context).catch((error) => mavenOutputChannel.appendLine(`Unable to register the help page: ${error}`));
    await loadPackageInfo(context);
    await doActivate(context);
}

export async function doActivate(context: coc.ExtensionContext): Promise<void> {
    let alternateWindowId: number | undefined;
    pluginInfoProvider.initialize(context);
    // register tree view
    fetchProjectOutputs(await MavenProjectManager.loadProjects());
    const mavenExplorerProvider: MavenExplorerProvider = MavenExplorerProvider.getInstance();
    const mavenExplorerView = coc.window.createTreeView("MAVEN PROJECTS", {
        bufhidden: "hide",
        treeDataProvider: mavenExplorerProvider
    });

    context.subscriptions.push(mavenExplorerView);
    MavenExplorerProvider.getInstance().refresh();
    // pom.xml listener to refresh tree view
    registerPomFileWatcher(context);
    // register output, terminal, taskExecutor
    context.subscriptions.push(mavenOutputChannel, mavenTerminal, taskExecutor);

    registerCommand(context, "maven.history", async () => {
        mavenHistoryHandler(await selectProjectIfNecessary());
    });

    registerCommand(context, "maven.archetype.generate", ArchetypeModule.createMavenProject);
    registerCommand(context, "maven.archetype.update", updateArchetypeCatalogHandler);

    registerConfigChangeListener(context);
    registerPomFileAuthoringHelpers(context);

    registerCommand(context, "maven.explorer.show", async () => {
        if (mavenExplorerView?.visible) {
            const winId = mavenExplorerView.windowId;
            const tabnr = (await nvim.call("tabpagenr")) as number;
            const buflist = (await nvim.call("tabpagebuflist", [tabnr])) as number[];
            const bufId = await nvim.call("winbufnr", [winId]);
            const found = buflist.find((bufnr) => {
                return bufId == bufnr;
            });
            if (!found) {
                await nvim.call("coc#window#close", [winId]);
                alternateWindowId = (await nvim.call("win_getid")) as number;
                await mavenExplorerView?.show("botright 40vs");
            }
        } else if (!mavenExplorerView?.visible) {
            alternateWindowId = (await nvim.call("win_getid")) as number;
            const viewId = (await nvim.eval(`get(w:,'cocViewId', v:null)`)) as string;
            if (viewId) {
                await nvim.command(`let w:cocViewId = ''`);
            }
            await mavenExplorerView?.show("botright 40vs");
        }
    });
    const noticeIfExplorerClosed = (text: string): void => {
        if (!mavenExplorerView?.visible) {
            coc.window.showInformationMessage(text);
        }
    };
    registerCommand(context, "maven.explorer.flat", () => {
        Settings.changeToFlatView();
        noticeIfExplorerClosed("Maven explorer is not open, the flat view applies when it opens");
    });
    registerCommand(context, "maven.explorer.hierarchical", () => {
        Settings.changeToHierarchicalView();
        noticeIfExplorerClosed("Maven explorer is not open, the hierarchical view applies when it opens");
    });
    registerCommand(context, "maven.explorer.refresh", async () => {
        mavenExplorerProvider.refresh();
        noticeIfExplorerClosed("Maven explorer is not open, nothing to refresh");
    });

    registerCommand(context, "maven.project.effectivePom", async (data) => {
        await reportFailure("open the effective pom", data, () => Utils.showEffectivePom(data));
    });
    registerCommand(context, "maven.project.addDependency", async (data) => {
        await reportFailure("add a dependency", data, () => addDependencyHandler(data));
    });
    registerCommand(
        context,
        "maven.project.setDependencyVersion",
        async (data: any) => {
            setDependencyVersionHandlerGeneric(data);
        },
        true
    );
    registerCommand(context, "maven.project.showDependencies", async (data: any) => {
        await reportFailure("show the dependencies", data, () => showDependenciesHandler(data));
    });
    registerCommand(context, "maven.project.configuration.update", async () => {
        mavenExplorerProvider.refresh();
        if (isJavaExtEnabled()) {
            // Reload All Maven Projects in JDTLS, impl in upstream
            try {
                const poms: Uri[] = MavenProjectManager.projects.map((project: any) => Uri.file(project.pomPath));
                if (poms.length === 0) {
                    coc.window.showWarningMessage("No Maven projects to update, open a Maven project");
                } else {
                    await coc.commands.executeCommand("java.projectConfiguration.update", poms);
                    coc.window.showInformationMessage(`Updating the configuration of ${poms.length} Maven project${poms.length === 1 ? "" : "s"}`);
                }
            } catch (error) {
                coc.window.showErrorMessage(`Unable to update the project configuration ${(error as Error).message}`);
            }
        } else {
            coc.window.showWarningMessage("The Java language server is not enabled, projects were not reloaded");
        }
    });
    registerCommand(
        context,
        "maven.project.resource.open",
        async (uri: string, openCommand?: string) => {
            await focusResourceLocation(uri, alternateWindowId, openCommand);
        },
        true
    );

    registerCommand(context, "maven.goal.custom", async (node?: string | MavenProject, goal?: string, env?: { [key: string]: string }) => {
        return await Utils.executeCustomGoal(await resolveProject(node), goal, env);
    });
    registerCommand(
        context,
        "maven.goal.execute",
        async (node?: string | MavenProject) => await Utils.executeMavenCommand(await resolveProject(node))
    );
    registerCommand(
        context,
        "maven.favorites",
        async (node?: string | MavenProject) => await runFavoriteCommandsHandler(await resolveProject(node))
    );
    registerCommand(context, "maven.lifecycle.execute", executeLifecyclePhaseHandler, true);
    DEFAULT_MAVEN_LIFECYCLES.forEach((goal: string) => {
        registerCommand(context, `maven.goal.${goal}`, async (node?: string | MavenProject) => {
            const project: MavenProject | undefined = await resolveProject(node);
            if (project) {
                await executeInTerminal({ command: goal, pomFile: project.pomPath });
            }
        });
    });
    registerCommand(
        context,
        "maven.explorer.plugin.goal",
        async (pluginGoal: PluginGoal) =>
            await executeInTerminal({
                command: pluginGoal.command,
                pomFile: pluginGoal.plugin.project.pomPath
            }),
        true
    );
    DEFAULT_MAVEN_LIFECYCLES.forEach((goal: string) => {
        registerCommand(
            context,
            `maven.explorer.phase.${goal}`,
            async (phase: LifecyclePhase) => executeInTerminal({ command: goal, pomFile: phase.project.pomPath }),
            true
        );
    });
    registerCommand(
        context,
        "maven.explorer.profile.toggle",
        (profile: MavenProfile) => {
            profile.selected = !profile.selected;
            mavenExplorerProvider.refresh(profile);
        },
        true
    );
    registerCommand(
        context,
        "maven.explorer.dependency.action",
        async (project: MavenProject) => {
            type CommandItem = coc.QuickPickItem & { command: string };
            const actions = [
                ...(project instanceof Dependency && project.omittedStatus?.status === "conflict"
                    ? [
                          {
                              label: "Goto effective",
                              description: `Reveal the effective version ${project.omittedStatus.effectiveVersion} in the explorer`,
                              command: "maven.explorer.dependency.goToEffective"
                          }
                      ]
                    : []),
                {
                    label: "Goto definition",
                    description: "Focus dependency in project",
                    command: "maven.explorer.goToDefinition"
                },
                {
                    label: "Change version",
                    description: "Change version of dependency",
                    command: "maven.explorer.setDependencyVersion"
                },
                {
                    label: "Exclude dependency",
                    description: "Remove dependency from project",
                    command: "maven.explorer.excludeDependency"
                }
            ] as CommandItem[];

            const picked = await coc.window.showQuickPick(actions, {
                placeholder: "Choose a dependency action",
                canPickMany: false,
                title: ""
            });

            if (picked === undefined) {
                throw new Error("You must select a dependency action to continue.");
            }
            await coc.commands.executeCommand(picked.command, project);
        },
        true
    );

    registerCommand(context, "maven.explorer.setDependencyVersion", setDependencyVersionHandler, true);
    registerCommand(context, "maven.explorer.excludeDependency", excludeDependencyHandler, true);
    registerCommand(context, "maven.explorer.goToDefinition", jumpToDefinitionHandler, true);
    registerCommand(context, "maven.explorer.goToEffective", Utils.showEffectivePom, true);
    registerCommand(
        context,
        "maven.explorer.dependency.goToEffective",
        (node?: Dependency) => goToEffectiveHandler(mavenExplorerView, node),
        true
    );
    // completion items carry this command for telemetry upstream, there is nothing to report here
    registerCommand(context, COMMAND_COMPLETION_ITEM_SELECTED, () => undefined, true);
    registerCommand(context, "maven.new.module", ArchetypeModule.createMavenModule);
    registerCommand(context, "maven.project.addFavorite", addFavoriteHandler);
    registerCommand(context, "maven.project.openPom", async (node?: string | MavenProject) => {
        const project: MavenProject | undefined = await resolveProject(node);
        if (project) {
            await focusResourceLocation(coc.Uri.file(project.pomPath).toString(), alternateWindowId);
        }
    });
    registerCommand(context, "maven.explorer.favorites", runFavoriteCommandsHandler, true);

    // Free resources when a terminal is manually closed
    context.subscriptions.push(
        coc.window.onDidCloseTerminal((closedTerminal: coc.Terminal) => {
            const name: string | undefined = mavenTerminal.find(closedTerminal);
            if (name !== undefined) {
                mavenTerminal.dispose(name);
            }
        })
    );

    // Reload projects when workspace folders added/removed
    context.subscriptions.push(
        coc.workspace.onDidChangeWorkspaceFolders(async (e: coc.WorkspaceFoldersChangeEvent) => {
            for (const removedWorkspaceFolder of e.removed) {
                await mavenExplorerProvider.removeWorkspaceFolder(removedWorkspaceFolder);
            }
            for (const addedWorkspaceFolder of e.added) {
                fetchProjectOutputs(await mavenExplorerProvider.addWorkspaceFolder(addedWorkspaceFolder));
            }
        })
    );

    // register artifact searcher if Java language server is activated
    if (isJavaExtEnabled()) {
        registerArtifactSearcher(context);
    }

    // diagnostic
    diagnosticProvider.initialize(context);
    // textDocument based output (e.g. effective-pom, dependencies)
    context.subscriptions.push(coc.workspace.registerTextDocumentContentProvider("coc-maven", contentProvider));

    await initMavenXsd();
}

/**
 * Loads the chosen maven outputs of a project in the background, one task per pom. An open document of a loaded output
 * reloads, a loaded dependency tree also refreshes the conflict diagnostics of the pom.
 */
function loadProjectOutputs(project: MavenProject, outputs: { effectivePom: boolean; dependencyTree: boolean }): void {
    if (outputs.effectivePom || outputs.dependencyTree) {
        taskExecutor.execute(project.pomPath, async () => {
            if (outputs.effectivePom) {
                await project.getEffectivePom();
                contentProvider.invalidate(effectivePomContentUri(project.pomPath));
            }
            if (outputs.dependencyTree) {
                await project.getDependencyTree();
                contentProvider.invalidate(dependenciesContentUri(project.pomPath));
                await diagnosticProvider.refreshDiagnostics(coc.Uri.file(project.pomPath));
            }
            MavenExplorerProvider.getInstance().refresh(project);
        });
    }
}

// the loaded projects of a build compute their outputs ahead of the first read, the other poms on their first read;
// the effective pom follows its own setting, the dependency tree is only needed for the conflict diagnostics
function fetchProjectOutputs(projects: MavenProject[]): void {
    const build: Set<MavenProject> = MavenProjectManager.buildProjects();
    projects
        .filter((project) => build.has(project))
        .forEach((project) =>
            loadProjectOutputs(project, {
                effectivePom: Settings.Pomfile.prefetchEffectivePom(project.pomPath),
                dependencyTree: Settings.enableConflictDiagnostics()
            })
        );
}

async function refreshChangedPom(pomPath: string): Promise<void> {
    const project: MavenProject | undefined = MavenProjectManager.get(pomPath);
    if (project) {
        // the pom changed on disk, both outputs of it and of the modules that inherit from it are outdated now
        const outdated: MavenProject[] = [project, ...inheritingProjects(project.pomPath)];
        // the settings decide which outputs of the saved pom load right away, the others, and those of the inheriting
        // modules, load on their next read, which for an open document of theirs is the reload that starts here
        const eager = { effectivePom: Settings.Pomfile.autoUpdateEffectivePOM(), dependencyTree: Settings.enableConflictDiagnostics() };
        for (const outdatedProject of outdated) {
            outdatedProject.invalidateEffectivePom();
            outdatedProject.invalidateDependencyTree();
            if (!eager.effectivePom || outdatedProject !== project) {
                contentProvider.invalidate(effectivePomContentUri(outdatedProject.pomPath));
            }
            if (!eager.dependencyTree || outdatedProject !== project) {
                contentProvider.invalidate(dependenciesContentUri(outdatedProject.pomPath));
            }
        }

        await project.refresh();
        // a pom outside of a build loads its outputs on the next read, like it did before the change
        if (MavenProjectManager.buildProjects().has(project)) {
            loadProjectOutputs(project, eager);
        }
    }
}

// the projects whose <parent> chain leads to the pom, their effective pom and dependency tree include it
function inheritingProjects(pomPath: string, seen: Set<string> = new Set([path.resolve(pomPath)])): MavenProject[] {
    const children: MavenProject[] = MavenProjectManager.projects.filter((candidate) => {
        const parentPomPath: string | undefined = candidate.parentPomPath;
        return (
            parentPomPath !== undefined &&
            path.resolve(parentPomPath) === path.resolve(pomPath) &&
            !seen.has(path.resolve(candidate.pomPath))
        );
    });
    children.forEach((child) => seen.add(path.resolve(child.pomPath)));
    return children.flatMap((child) => [child, ...inheritingProjects(child.pomPath, seen)]);
}

function registerPomFileWatcher(context: coc.ExtensionContext): void {
    const watcher: coc.FileSystemWatcher = coc.workspace.createFileSystemWatcher(Settings.Pomfile.globPattern());
    // a burst of changes to one pom (autosave, :wa, a formatter) refreshes it once, after it stayed unchanged for a while
    const pendingRefreshes = new Map<string, NodeJS.Timer>();
    watcher.onDidCreate(
        async (e: Uri) => {
            await MavenExplorerProvider.getInstance().addProject(e.fsPath);
            const project: MavenProject | undefined = MavenProjectManager.get(e.fsPath);
            if (project) {
                fetchProjectOutputs([project]);
            }
        },
        null,
        context.subscriptions
    );
    watcher.onDidChange(
        (e: Uri) => {
            clearTimeout(pendingRefreshes.get(e.fsPath));
            const timer: NodeJS.Timer = setTimeout(() => {
                pendingRefreshes.delete(e.fsPath);
                refreshChangedPom(e.fsPath).catch((error) => console.warn((error as Error).message));
            }, POM_REFRESH_DELAY_MS);
            pendingRefreshes.set(e.fsPath, timer);
        },
        null,
        context.subscriptions
    );
    context.subscriptions.push(coc.Disposable.create(() => pendingRefreshes.forEach((timer) => clearTimeout(timer))));
    watcher.onDidDelete((e: Uri) => MavenExplorerProvider.getInstance().removeProject(e.fsPath), null, context.subscriptions);
    context.subscriptions.push(watcher);
}

function registerConfigChangeListener(context: coc.ExtensionContext): void {
    const configChangeListener: coc.Disposable = coc.workspace.onDidChangeConfiguration(async (e: coc.ConfigurationChangeEvent) => {
        // close all terminals with outdated JAVA related environment variables
        if (e.affectsConfiguration("maven.terminal.customEnv")) {
            mavenTerminal.dispose();
        }
        if (
            e.affectsConfiguration("maven.view") ||
            e.affectsConfiguration("maven.pomfile.globPattern") ||
            e.affectsConfiguration("maven.explorer.projectName") ||
            e.affectsConfiguration("maven.terminal.favorites")
        ) {
            MavenExplorerProvider.getInstance().refresh();
        }
        if (e.affectsConfiguration("maven.executable.preferMavenWrapper")) {
            context.workspaceState.update("trustMavenWrapper", undefined);
        }
        // refresh MAVEN_LOCAL_REPOSITORY when change to a new settingsFile
        if (e.affectsConfiguration("maven.settingsFile")) {
            await loadMavenSettingsFilePath();
        }
    });
    context.subscriptions.push(configChangeListener);
}

function registerPomFileAuthoringHelpers(context: coc.ExtensionContext): void {
    const pomSelector: coc.DocumentSelector = [
        {
            // Ensure that you are using the coc_filetype_map and that is configured to map the pom.xml filetype that vim sets to xml, that would allow this plugin and others like coc-xml to be enabled
            language: "xml",
            // This is a special case of the globbing, we would like to target pom.xml files as well as .pom files which
            // might be uri generated by the exetnsion itself using the coc-maven schema, along with different authorities -
            // local-repository and so on. Do not use the user provided configuration as that might not be broad enough to capture the file patterns
            pattern: "**/{pom.xml,*.pom}"
        }
    ];
    // completion
    context.subscriptions.push(
        coc.languages.registerCompletionItemProvider("maven", "M", pomSelector, completionProvider, [".", "-", "<"])
    );
    // hover
    context.subscriptions.push(coc.languages.registerHoverProvider(pomSelector, hoverProvider));
    // navigate to dependency pom
    context.subscriptions.push(coc.languages.registerDefinitionProvider(pomSelector, definitionProvider));
    // add a dependency
    context.subscriptions.push(coc.languages.registerCodeActionProvider(pomSelector, codeActionProvider, undefined));
    // add quick fix
    context.subscriptions.push(
        coc.languages.registerCodeActionProvider(pomSelector, conflictResolver, undefined, ConflictResolver.providedCodeActionKinds)
    );
}

/**
 * Resolve the project a command should operate on, either the one provided by the caller, as a project or a path to its
 * pom file, or one selected by the user when there are multiple projects in the workspace.
 */
async function resolveProject(node?: string | MavenProject): Promise<MavenProject | undefined> {
    let project: MavenProject | undefined;
    if (node instanceof MavenProject) {
        project = node;
    } else if (typeof node === "string" && node.length > 0) {
        project = MavenProjectManager.get(node);
        if (!project) {
            coc.window.showErrorMessage(`No maven project found for pom file ${node}`);
        }
    } else if (hasProjects()) {
        project = await selectProjectIfNecessary();
    }
    return project;
}

function hasProjects(): boolean {
    const found: boolean = (MavenProjectManager.projects?.length ?? 0) > 0;
    if (!found) {
        coc.window.showWarningMessage("No Maven project in the workspace, open a folder with a pom.xml");
    }
    return found;
}

/** Run a handler to completion and turn its failure into an error message, a rejection of a command is only logged. */
async function reportFailure(action: string, data: unknown, run: () => Promise<void>): Promise<void> {
    try {
        // without a target the handlers pick a project, which needs one
        if ((data !== undefined && data !== null) || hasProjects()) {
            await run();
        }
    } catch (error) {
        coc.window.showErrorMessage(`Unable to ${action} ${(error as Error).message}`);
    }
}

async function mavenHistoryHandler(item: MavenProject | undefined): Promise<void> {
    if (item) {
        await Utils.executeHistoricalGoals([item.pomPath]);
    } else {
        await Utils.executeHistoricalGoals(MavenProjectManager.projects.map((node) => node.pomPath));
    }
}

async function updateArchetypeCatalogHandler(): Promise<void> {
    await coc.window.withProgress({ title: "Updating archetype catalog..." }, async (p: Progress<{ message: string }>) => {
        try {
            await ArchetypeModule.updateArchetypeCatalog();
            p.report({ message: "Finished updating architypes." });
            coc.window.showInformationMessage("Archetype catalog updated");
        } catch (error) {
            coc.window.showErrorMessage(`Unable to update catalog ${(error as Error).message}`);
            throw error;
        }
    });
}
