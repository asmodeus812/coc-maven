// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

"use strict";
import * as coc from "coc.nvim";
import { Progress, Uri, nvim } from "coc.nvim";
import { diagnosticProvider } from "./DiagnosticProvider";
import { Settings } from "./Settings";
import { ArchetypeModule } from "./archetype/ArchetypeModule";
import { codeActionProvider } from "./codeAction/codeActionProvider";
import { ConflictResolver, conflictResolver } from "./codeAction/conflictResolver";
import { PomCompletionProvider } from "./completion/PomCompletionProvider";
import { DEFAULT_MAVEN_LIFECYCLES } from "./completion/constants";
import { contentProvider } from "./contentProvider";
import { definitionProvider } from "./definition/definitionProvider";
import { MavenExplorerProvider } from "./explorer/MavenExplorerProvider";
import { LifecyclePhase } from "./explorer/model/LifecyclePhase";
import { MavenProject } from "./explorer/model/MavenProject";
import { PluginGoal } from "./explorer/model/PluginGoal";
import { pluginInfoProvider } from "./explorer/pluginInfoProvider";
import { addDependencyHandler } from "./handlers/dependency/addDependencyHandler";
import { excludeDependencyHandler } from "./handlers/dependency/excludeDependencyHandler";
import { jumpToDefinitionHandler } from "./handlers/dependency/jumpToDefinitionHandler";
import { setDependencyVersionHandler } from "./handlers/dependency/setDependencyVersionHandler";
import { showDependenciesHandler } from "./handlers/dependency/showDependenciesHandler";
import { runFavoriteCommandsHandler } from "./handlers/favorites/runFavoriteCommandsHandler";
import { hoverProvider } from "./hover/hoverProvider";
import { registerArtifactSearcher } from "./jdtls/artifactSearcher";
import { isJavaExtEnabled } from "./jdtls/commands";
import { mavenOutputChannel } from "./mavenOutputChannel";
import { mavenTerminal } from "./mavenTerminal";
import { init as initMavenXsd } from "./mavenXsd";
import { MavenProjectManager } from "./project/MavenProjectManager";
import { taskExecutor } from "./taskExecutor";
import { Utils } from "./utils/Utils";
import { loadMavenSettingsFilePath, loadPackageInfo } from "./utils/contextUtils";
import { executeInTerminal } from "./utils/mavenUtils";
import { dependenciesContentUri, effectivePomContentUri, registerCommand, selectProjectIfNecessary } from "./utils/uiUtils";
import { MavenProfile } from "./explorer/model/MavenProfile";

export async function activate(context: coc.ExtensionContext): Promise<void> {
    await loadPackageInfo(context);
    await doActivate(context);
}

export async function doActivate(context: coc.ExtensionContext): Promise<void> {
    let alternateWindowId: number | undefined;
    pluginInfoProvider.initialize(context);
    // register tree view
    await MavenProjectManager.loadProjects();
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
    registerCommand(context, "maven.explorer.flat", () => Settings.changeToFlatView());
    registerCommand(context, "maven.explorer.hierarchical", () => Settings.changeToHierarchicalView());
    registerCommand(context, "maven.explorer.refresh", async () => {
        mavenExplorerProvider.refresh();
    });

    registerCommand(context, "maven.project.effectivePom", async () => {
        Utils.showEffectivePom(await selectProjectIfNecessary());
    });
    registerCommand(context, "maven.project.addDependency", async () => {
        addDependencyHandler(await selectProjectIfNecessary());
    });
    registerCommand(context, "maven.project.showDependencies", async () => {
        showDependenciesHandler(await selectProjectIfNecessary());
    });
    registerCommand(context, "maven.project.configuration.update", () => {
        mavenExplorerProvider.refresh();
        if (isJavaExtEnabled()) {
            // Reload All Maven Projects in JDTLS, impl in upstream
            coc.commands.executeCommand(
                "java.projectConfiguration.update",
                MavenProjectManager.projects.map((n: any) => Uri.file(n.pomPath))
            );
        }
    });
    registerCommand(
        context,
        "maven.project.resource.open",
        async (uri: string, openCommand?: string) => {
            await nvim.call("win_gotoid", [alternateWindowId]);
            await coc.workspace.jumpTo(uri, null, openCommand);
        },
        true
    );

    registerCommand(context, "maven.goal.custom", async () => {
        return await Utils.executeCustomGoal(await selectProjectIfNecessary());
    });
    registerCommand(
        context,
        "maven.explorer.plugin.goal",
        async (pluginGoal: PluginGoal) =>
            await executeInTerminal({
                command: pluginGoal.command,
                pomfile: pluginGoal.plugin.project.pomPath
            }),
        true
    );
    DEFAULT_MAVEN_LIFECYCLES.forEach((goal: string) => {
        registerCommand(
            context,
            `maven.explorer.phase.${goal}`,
            async (phase: LifecyclePhase) => executeInTerminal({ command: goal, pomfile: phase.project.pomPath }),
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
        "maven.exploerer.dependency.action", // note: keeping the spelling you requested
        async (project: MavenProject) => {
            type CommandItem = coc.QuickPickItem & { command: string };
            const actions = [
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
                await mavenExplorerProvider.addWorkspaceFolder(addedWorkspaceFolder);
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

function registerPomFileWatcher(context: coc.ExtensionContext): void {
    const watcher: coc.FileSystemWatcher = coc.workspace.createFileSystemWatcher(Settings.Pomfile.globPattern());
    watcher.onDidCreate((e: Uri) => MavenExplorerProvider.getInstance().addProject(e.fsPath), null, context.subscriptions);
    watcher.onDidChange(
        async (e: Uri) => {
            const project: MavenProject | undefined = MavenProjectManager.get(e.fsPath);
            if (project) {
                // notify dependencies/effectivePOM to update
                contentProvider.invalidate(effectivePomContentUri(project.pomPath));
                contentProvider.invalidate(dependenciesContentUri(project.pomPath));

                await project.refresh();
                if (Settings.Pomfile.autoUpdateEffectivePOM()) {
                    taskExecutor.execute(async () => {
                        await project.refreshEffectivePom();
                        MavenExplorerProvider.getInstance().refresh(project);
                    });
                }
            }
        },
        null,
        context.subscriptions
    );
    watcher.onDidDelete((e: Uri) => MavenExplorerProvider.getInstance().removeProject(e.fsPath), null, context.subscriptions);
    context.subscriptions.push(watcher);
}

function registerConfigChangeListener(context: coc.ExtensionContext): void {
    const configChangeListener: coc.Disposable = coc.workspace.onDidChangeConfiguration(async (e: coc.ConfigurationChangeEvent) => {
        // close all terminals with outdated JAVA related environment variables
        if (
            e.affectsConfiguration("maven.terminal.useJavaHome") ||
            e.affectsConfiguration("maven.terminal.customEnv") ||
            (e.affectsConfiguration("java.home") && Settings.Terminal.useJavaHome())
        ) {
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
            language: "xml",
            scheme: "file",
            pattern: Settings.Pomfile.globPattern()
        }
    ];
    // completion item provider
    context.subscriptions.push(
        coc.languages.registerCompletionItemProvider("maven", "M", pomSelector, new PomCompletionProvider(), [".", "-", "<"])
    );
    // hover
    context.subscriptions.push(coc.languages.registerHoverProvider(pomSelector, hoverProvider));
    // navigate to dependency pom
    context.subscriptions.push(coc.languages.registerDefinitionProvider(pomSelector, definitionProvider));
    // add a dependency
    context.subscriptions.push(coc.languages.registerCodeActionProvider(pomSelector, codeActionProvider, undefined));
    // add quick fix for conflict dependencies
    context.subscriptions.push(
        coc.languages.registerCodeActionProvider(pomSelector, conflictResolver, undefined, ConflictResolver.providedCodeActionKinds)
    );
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
        await ArchetypeModule.updateArchetypeCatalog();
        p.report({ message: "Finished updating architypes." });
    });
}
