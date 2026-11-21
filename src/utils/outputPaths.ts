import * as coc from "coc.nvim";
import expandHome from "expand-home-dir";
import md5 from "md5";
import * as path from "path";
import { Settings } from "../Settings";
import { getPathToTempFolder, getPathToWorkspaceStorage } from "./contextUtils";

/**
 * The folder that receives the files maven generates for a project: its effective pom, dependency tree, profile list and
 * plugin descriptions. It comes from maven.outputDirectory, read for the pom so a workspace folder can override it.
 * ${workspaceFolder}, ${projectDir} and ${relativeProjectDir} are replaced, then ${env:NAME}, ${NAME} and $NAME from the
 * environment and a leading ~. A relative result resolves against the folder of the pom. Empty, the default, is a
 * folder named after the md5 of the pom path in the storage of the extension.
 */
export function outputDirectory(pomPath: string): string {
    const projectDir: string = path.dirname(path.resolve(pomPath));
    const configured: string = Settings.outputDirectory(pomPath)?.trim() ?? "";
    let result: string;
    if (configured === "") {
        const key: string = md5(path.resolve(pomPath));
        result = getPathToWorkspaceStorage(key) ?? getPathToTempFolder(key);
    } else {
        const folder: coc.WorkspaceFolder | undefined = coc.workspace.getWorkspaceFolder(coc.Uri.file(projectDir).toString());
        const workspaceDir: string = folder ? coc.Uri.parse(folder.uri).fsPath : projectDir;
        const variables: { [name: string]: string } = {
            workspaceFolder: workspaceDir,
            projectDir,
            relativeProjectDir: path.relative(workspaceDir, projectDir) || "."
        };
        result = path.resolve(projectDir, expandHome(expandVariables(configured, variables)));
    }
    return result;
}

// a known variable or an environment variable is replaced, anything else stays as written
function expandVariables(value: string, variables: { [name: string]: string }): string {
    return value.replace(/\$\{env:(\w+)\}|\$\{(\w+)\}|\$(\w+)/g, (match: string, envName?: string, braced?: string, bare?: string) => {
        const name: string = envName ?? braced ?? bare ?? "";
        const known: string | undefined = envName === undefined ? variables[name] : undefined;
        return known ?? process.env[name] ?? match;
    });
}

/**
 * Path of a generated file of a project, such as effective-pom.xml, in its output folder.
 */
export function mavenOutputPath(pomPath: string, name: string): string {
    return path.join(outputDirectory(pomPath), name);
}

/**
 * Path of the file next to a generated file that records the modification times of the poms it belongs to.
 */
export function mavenStatePath(pomPath: string, name: string): string {
    return `${mavenOutputPath(pomPath, name)}.mtime`;
}

/**
 * Path of the description of a plugin, written for the project whose pom ran help:describe.
 */
export function pluginDescriptionPath(pomPath: string, pluginId: string): string {
    return path.join(outputDirectory(pomPath), "plugins", `${pluginId.replace(/[:\\/]/g, "_")}.txt`);
}
