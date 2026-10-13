// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import which from "which";

/**
 * Spawn an executable directly, without going through a shell, the arguments are passed verbatim to the process, which
 * means that they must not be quoted, and no shell expansion or interpretation is applied to them. On windows batch files
 * (.cmd/.bat) can not be spawned directly, for those the command processor is used with each argument quoted.
 */
export function spawnExecutable(command: string, args: readonly string[], options: child_process.SpawnOptions): child_process.ChildProcess {
    const executable: string | undefined = resolveExecutablePath(command, options);
    if (!executable) {
        const error: NodeJS.ErrnoException = new Error(`Executable not found: ${command}`);
        error.code = "ENOENT";
        throw error;
    }
    if (process.platform === "win32" && /\.(?:bat|cmd)$/i.test(executable)) {
        const quoted: string[] = [executable, ...args].map((arg) => `"${arg.replace(/"/g, '""')}"`);
        return child_process.spawn(`"${quoted.join(" ")}"`, [], { ...options, shell: true, windowsVerbatimArguments: true });
    }
    return child_process.spawn(executable, [...args], { ...options, shell: false });
}

export function resolveExecutablePath(command: string, options: Pick<child_process.SpawnOptions, "cwd" | "env"> = {}): string | undefined {
    const cwd: string = typeof options.cwd === "string" ? options.cwd : process.cwd();
    const environment: NodeJS.ProcessEnv = options.env ?? process.env;
    const hasPathSeparator: boolean = command.includes(path.sep) || (process.platform === "win32" && command.includes("/"));
    if (hasPathSeparator) {
        const candidate: string = path.isAbsolute(command) ? command : path.resolve(cwd, command);
        return fs.existsSync(candidate) ? candidate : (which.sync(candidate, { nothrow: true }) ?? undefined);
    }
    return which.sync(command, { nothrow: true, path: environment.PATH ?? environment.Path }) ?? undefined;
}

export function mergeEnvironment(base: NodeJS.ProcessEnv, overrides: { [key: string]: string }): NodeJS.ProcessEnv {
    const merged: NodeJS.ProcessEnv = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
        if (process.platform === "win32") {
            for (const existingKey of Object.keys(merged)) {
                if (existingKey.toUpperCase() === key.toUpperCase()) {
                    delete merged[existingKey];
                }
            }
        }
        merged[key] = value;
    }
    return merged;
}
