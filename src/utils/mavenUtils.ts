// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as child_process from "child_process";
import * as coc from "coc.nvim";
import expandHome from "expand-home-dir";
import * as fse from "fs-extra";
import md5 from "md5";
import * as path from "path";
import { getMavenExecutableOptionArgs } from "../archetype/archetypeCommand";
import { mavenOutputChannel } from "../mavenOutputChannel";
import { mavenTerminal } from "../mavenTerminal";
import { MavenProjectManager } from "../project/MavenProjectManager";
import { Settings } from "../Settings";
import { getPathToExtensionRoot, getPathToTempFolder, getPathToWorkspaceStorage } from "./contextUtils";
import { updateLRUCommands } from "./historyUtils";
import { mergeEnvironment, resolveExecutablePath, spawnExecutable } from "./spawnExecutable";

// calculate dependency graph
const GOAL_DEPENDENCY_GRAPH = "com.github.ferstl:depgraph-maven-plugin:4.0.2:graph";
const OPTIONS_DEPENDENCY_GRAPH = ["-DgraphFormat=text", "-DshowDuplicates", "-DshowConflicts", "-DshowVersions", "-DshowGroupIds"];

/**
 * Get effective pom of a Maven project.
 *
 * @param pomPath absolute path of pom.xml
 * @param options specify the way you want to get effective pom. By default it 1) reads from cache if exists 2) calculate if not.
 * @returns full content of effective pom
 */
export async function rawEffectivePom(pomPath: string, options?: { cacheOnly?: boolean }): Promise<string | undefined> {
    const outputPath: string = getTempFolder(pomPath);
    const epomPath = `${outputPath}.epom`;
    const mtimePath = `${outputPath}.mtime`;
    const cachedMTimeMs: string | undefined = await readFileIfExists(mtimePath);
    const stat: fse.Stats = await fse.stat(pomPath);
    const mtimeMs: string = stat.mtimeMs.toString();

    if (cachedMTimeMs === mtimeMs || options?.cacheOnly) {
        return await readFileIfExists(epomPath);
    }

    await executeInBackground({ pomFile: pomPath, args: ["-B", `-Doutput=${epomPath}`, "help:effective-pom"] });
    await fse.writeFile(mtimePath, mtimeMs);
    return await readFileIfExists(epomPath);
}

export async function rawDependencyTree(pomPath: string): Promise<string | undefined> {
    const outputPath: string = getTempFolder(pomPath);
    const dependencyGraphPath = `${outputPath}.deps.txt`;
    const outputDirectory: string = path.dirname(dependencyGraphPath);
    const outputFileName: string = path.basename(dependencyGraphPath);
    await executeInBackground({
        pomFile: pomPath,
        args: [
            "-B",
            "-N",
            ...OPTIONS_DEPENDENCY_GRAPH,
            `-DoutputDirectory=${outputDirectory}`,
            `-DoutputFileName=${outputFileName}`,
            GOAL_DEPENDENCY_GRAPH
        ]
    });
    return await readFileIfExists(path.join(outputDirectory, outputFileName));
}

export async function pluginDescription(pluginId: string, pomPath: string): Promise<string | undefined> {
    const outputPath: string = getTempFolder(pluginId);
    // For MacOSX, add "-Dapple.awt.UIElement=true" to prevent showing icons in dock
    await executeInBackground({
        pomFile: pomPath,
        args: ["-B", "-Dapple.awt.UIElement=true", `-Dplugin=${pluginId}`, `-Doutput=${outputPath}`, "help:describe"]
    });
    return await readFileIfExists(outputPath);
}

export async function rawProfileList(pomPath: string): Promise<string | undefined> {
    const outputPath: string = getTempFolder(pomPath);
    const profileListPath = `${outputPath}.profiles.txt`;
    await executeInBackground({
        pomFile: pomPath,
        args: ["-B", `-Doutput=${profileListPath}`, "help:all-profiles"]
    });
    return await readFileIfExists(profileListPath);
}

/**
 * Run maven in the background, the process is spawned directly without a shell, therefore each argument is passed as is
 * to maven, arguments must not be quoted, the user provided executable options are split into separate arguments.
 */
export async function executeInBackground(options: {
    args: readonly string[];
    mvnExecutable?: string;
    pomFile?: string;
    cwd?: string;
    env?: { [key: string]: string };
}): Promise<unknown> {
    const workspaceFolder: coc.WorkspaceFolder | undefined = options.pomFile
        ? coc.workspace.getWorkspaceFolder(coc.Uri.file(options.pomFile).toString())
        : undefined;
    const cwd: string | undefined =
        options.cwd ?? (workspaceFolder ? coc.Uri.parse(workspaceFolder.uri).fsPath : undefined) ?? (options.pomFile ? path.dirname(options.pomFile) : undefined);
    const spawnOptions: child_process.SpawnOptions = {
        cwd,
        env: mergeEnvironment(process.env, { ...Settings.getEnvironment(options.pomFile), ...options.env })
    };

    const mvn: string | undefined = options.mvnExecutable || (await getMaven(options.pomFile, spawnOptions));
    if (mvn === undefined) {
        await promptToSettingMavenExecutable();
        return undefined;
    }

    const args: string[] = [];
    const mvnSettingsFile: string | undefined = Settings.getSettingsFilePath();
    if (mvnSettingsFile) {
        args.push("-s", mvnSettingsFile);
    }
    args.push(...options.args);
    args.push(...getMavenExecutableOptionArgs(Settings.Executable.optionsValue(options.pomFile)));
    if (options.pomFile) {
        args.push("-f", options.pomFile);
    }

    return new Promise<unknown>((resolve: (value: unknown) => void, reject: (e: Error) => void): void => {
        mavenOutputChannel.appendLine(`Spawn ${JSON.stringify({ command: mvn, args, cwd })}`);
        let proc: child_process.ChildProcess;
        try {
            proc = spawnExecutable(mvn, args, spawnOptions);
        } catch (error) {
            reject(new Error(`Error occurred in background process. ${(error as Error).message}`));
            return;
        }
        proc.on("error", (err: Error) => {
            reject(new Error(`Error occurred in background process. ${err.message}`));
        });
        proc.on("close", (code: number | null, signal: string | null) => {
            if (code !== null) {
                if (code === 0) {
                    resolve(code);
                } else {
                    reject(new Error(`Background process terminated with code ${code}.`));
                }
            } else {
                reject(new Error(`Background process killed by signal ${signal}.`));
            }
        });
        if (proc.stdout !== null) {
            proc.stdout.on("data", (chunk: Buffer) => {
                mavenOutputChannel.append(chunk.toString());
            });
        }
        if (proc.stderr !== null) {
            proc.stderr.on("data", (chunk: Buffer) => {
                mavenOutputChannel.append(chunk.toString());
            });
        }
    });
}

export async function executeInTerminal(options: {
    command: string;
    mvnExecutable?: string;
    pomFile?: string;
    cwd?: string;
    env?: { [key: string]: string };
    terminalName?: string;
}): Promise<coc.Terminal | undefined> {
    const { command, mvnExecutable, pomFile, cwd, env, terminalName } = options;
    const workspaceFolder: coc.WorkspaceFolder | undefined = pomFile ? coc.workspace.getWorkspaceFolder(coc.Uri.file(pomFile)) : undefined;
    const mvn: string | undefined = mvnExecutable || (await getMaven(pomFile));
    if (mvn === undefined) {
        await promptToSettingMavenExecutable();
        return undefined;
    }

    const mvnString: string = wrappedWithQuotes(await mavenTerminal.formattedPathForTerminal(mvn));
    const mvnSettingsFile: string | undefined = Settings.getSettingsFilePath();

    // profiles
    let profileOptions: string | undefined;
    if (pomFile) {
        const project = MavenProjectManager.get(pomFile);
        const selectedIds = project?.profiles?.filter((p) => p.selected === true)?.map((p) => p.id) ?? [];
        const unselectedIds = project?.profiles?.filter((p) => p.selected === false)?.map((p) => `-${p.id}`) ?? [];
        const profileList: string = selectedIds.concat(unselectedIds).join(",");
        if (profileList) {
            // quote the list, some shells (e.g. PowerShell) would otherwise split the list on the commas
            profileOptions = `-P="${profileList}"`;
        }
    }
    const fullCommand: string = [
        mvnString,
        mvnSettingsFile && `-s "${await mavenTerminal.formattedPathForTerminal(mvnSettingsFile)}"`,
        command.trim(),
        pomFile && `-f "${await mavenTerminal.formattedPathForTerminal(pomFile)}"`,
        profileOptions,
        Settings.Executable.options(pomFile)
    ]
        .filter(Boolean)
        .join(" ");
    const name: string = terminalName || (workspaceFolder ? `Maven-${workspaceFolder.name}` : "Maven");
    const terminal: coc.Terminal = await mavenTerminal.runInTerminal(fullCommand, { name, cwd, env, workspaceFolder });
    if (pomFile) {
        await updateLRUCommands(command, pomFile);
    }
    return terminal;
}

export async function getMaven(
    pomPath?: string,
    executableOptions: Pick<child_process.SpawnOptions, "cwd" | "env"> = {}
): Promise<string | undefined> {
    const mvnPathFromSettings: string | undefined = Settings.Executable.path(pomPath);
    if (mvnPathFromSettings) {
        // expand tilde to deal with ~/path-to-mvn
        return expandHome(mvnPathFromSettings);
    }

    const preferMavenWrapper: boolean = Settings.Executable.preferMavenWrapper(pomPath);
    if (preferMavenWrapper && pomPath) {
        const localMvnwPath: string | undefined = await getLocalMavenWrapper(path.dirname(pomPath));
        if (localMvnwPath) {
            return localMvnwPath;
        }
    }

    return defaultMavenExecutable(executableOptions);
}

export function getEmbeddedMavenWrapper(): string {
    const mvnw: string = isWin() ? "mvnw.cmd" : "mvnw";
    return getPathToExtensionRoot("resources", "maven-wrapper", mvnw);
}

async function getLocalMavenWrapper(projectFolder: string): Promise<string | undefined> {
    const mvnw: string = isWin() ? "mvnw.cmd" : "mvnw";

    // walk up parent folders
    let current: string = projectFolder;
    while (path.basename(current)) {
        const potentialMvnwPath: string = path.join(current, mvnw);
        if (await fse.pathExists(potentialMvnwPath)) {
            return potentialMvnwPath;
        }
        current = path.dirname(current);

        const folderUri = coc.Uri.file(current);
        if (coc.workspace.getWorkspaceFolder(folderUri) === undefined) {
            // traverse up to workspace root as trust granted
            return undefined;
        }
    }
    return undefined;
}

function defaultMavenExecutable(executableOptions: Pick<child_process.SpawnOptions, "cwd" | "env">): string | undefined {
    if (resolveExecutablePath("mvn", executableOptions)) {
        return "mvn";
    }
    mavenOutputChannel.appendLine("Maven executable not found in PATH.");
    return undefined;
}

function wrappedWithQuotes(mvn: string): string {
    if (mvn === "mvn") {
        return mvn;
    } else {
        return `"${mvn}"`;
    }
}

async function readFileIfExists(filepath: string): Promise<string | undefined> {
    if (await fse.pathExists(filepath)) {
        return (await fse.readFile(filepath)).toString();
    }
    return undefined;
}

function getTempFolder(identifier: string): string {
    const outputPath: string | undefined = getPathToWorkspaceStorage(md5(identifier));
    return outputPath || getPathToTempFolder(md5(identifier));
}

async function promptToSettingMavenExecutable(): Promise<void> {
    const SETTING_MAVEN_EXECUTABLE_PATH = "maven.executable.path";
    const MESSAGE = `Maven not found in PATH. Please specify "${SETTING_MAVEN_EXECUTABLE_PATH}".`;

    await coc.window.showInformationMessage(MESSAGE);
    const mvnPath = await browseForMavenBinary();
    if (mvnPath) {
        Settings.setMavenExecutablePath(mvnPath);
        await coc.window.showInformationMessage(`Successfully set "${SETTING_MAVEN_EXECUTABLE_PATH}" to: ${mvnPath}`);
    } else {
        await coc.window.showWarningMessage(`Setting maven binary canceled by the user`);
    }
}

async function browseForMavenBinary(): Promise<string | undefined> {
    const mvnFilename: string = isWin() ? "mvn.cmd" : "mvn";
    const promptTitle: string = `Enter path to ${mvnFilename} binary`;
    const mvnPath: string = await coc.window.requestInput(promptTitle, "", {
        placeholder: promptTitle
    });
    if (mvnPath === undefined) {
        return undefined;
    }
    if (!mvnPath?.endsWith(mvnFilename)) {
        await coc.window.showErrorMessage(`Maven executable must match: ${mvnFilename}`);
        return undefined;
    }

    return mvnPath;
}

function isWin(): boolean {
    return process.platform.startsWith("win");
}
