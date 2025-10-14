// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { Uri, window } from "coc.nvim";
import * as path from "path";
import { MavenProject } from "../explorer/model/MavenProject";
import { MavenProjectManager } from "../project/MavenProjectManager";

// file chooser dialog
export async function openDialogForFolder(customOptions: any): Promise<Uri | undefined> {
    const result: string = await window.requestInput(customOptions.openLabel, customOptions.defaultUri.fsPath, {
        placeholder: customOptions.openLabel
    });

    if (result && result.length > 0) {
        return Uri.parse(result);
    }
    return undefined;
}

export async function selectProjectIfNecessary(): Promise<MavenProject | undefined> {
    if (MavenProjectManager.projects === undefined || MavenProjectManager.projects.length === 0) {
        return undefined;
    }
    if (MavenProjectManager.projects.length === 1) {
        return MavenProjectManager.projects[0];
    }
    return await window
        .showQuickPick(
            MavenProjectManager.projects.map((item: MavenProject) => ({
                value: item,
                label: `${item.name}`,
                description: item.pomPath
            })),
            { placeHolder: "Select a Maven project ..." }
        )
        .then((item) => (item ? item.value : undefined));
}

export function registerCommand(
    context: coc.ExtensionContext,
    commandName: string,
    func: (...args: any[]) => any,
    internal: boolean = false
): void {
    context.subscriptions.push(coc.commands.registerCommand(commandName, func, null, internal));
}

export function effectivePomContentUri(pomPath: string): coc.Uri {
    const displayName = "EffectivePOM.xml";
    const contentType = "effective-pom";
    return coc.Uri.file(path.join(pomPath, displayName)).with({ scheme: "coc-maven", authority: contentType, query: pomPath });
}

export function dependenciesContentUri(pomPath: string): coc.Uri {
    const displayName = "Dependencies";
    const contentType = "dependencies";
    return coc.Uri.file(path.join(pomPath, displayName)).with({ scheme: "coc-maven", authority: contentType, query: pomPath });
}
