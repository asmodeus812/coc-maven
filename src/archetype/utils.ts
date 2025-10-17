import path = require("path");
import * as coc from "coc.nvim";
import { isJavaLanguageServerStandard } from "../jdtls/commands";

// corresponding to setting values
const OPEN_IN_NEW_WORKSPACE = "Open";
const CANCEL_OPEN_WORKSPACE = "Cancel";

export async function promptOnDidProjectCreated(projectName: string, projectFolderPath: string) {
    // Open project either is the same workspace or new workspace
    const hasOpenFolder = coc.workspace.workspaceFolders !== undefined;
    const choice = await specifyOpenMethod(hasOpenFolder, projectName);
    if (choice === OPEN_IN_NEW_WORKSPACE) {
        await coc.commands.executeCommand("maven.project.resource.open", projectFolderPath);
    }
}

async function specifyOpenMethod(hasOpenFolder: boolean, projectLocation: string): Promise<string> {
    let openMethod = coc.workspace.getConfiguration("maven").get<string>("defaultOpenProjectMethod", OPEN_IN_NEW_WORKSPACE);
    if (openMethod !== CANCEL_OPEN_WORKSPACE && openMethod !== OPEN_IN_NEW_WORKSPACE) {
        let candidates: string[] = [OPEN_IN_NEW_WORKSPACE, hasOpenFolder ? CANCEL_OPEN_WORKSPACE : undefined].filter(
            (c) => c !== undefined
        );
        const result = await coc.window.showQuickPick(candidates, {
            placeholder: `Generated at location: ${projectLocation}`
        });
        if (result !== undefined) {
            openMethod = result;
        } else {
            return CANCEL_OPEN_WORKSPACE;
        }
    }
    return openMethod;
}

export async function importProjectOnDemand(projectFolder: string) {
    if (!isJavaLanguageServerStandard()) {
        return;
    }

    let projectInCurrentWorkspace = false;
    if (coc.workspace.workspaceFolders?.find((wf) => projectFolder.startsWith(wf.uri))) {
        projectInCurrentWorkspace = true;
    }

    if (!projectInCurrentWorkspace) {
        return;
    }

    const projectImportStrategy = coc.workspace.getConfiguration("java").get("import.projectSelection");
    if (projectImportStrategy === "automatic") {
        coc.commands.executeCommand("java.project.import");
    } else if (projectImportStrategy === "manual") {
        coc.commands.executeCommand<void>(
            "java.project.changeImportedProjects",
            [coc.Uri.parse(path.join(projectFolder, "pom.xml")).toString()],
            [],
            []
        );
    }
}
