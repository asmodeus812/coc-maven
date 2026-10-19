// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { FavoriteCommand } from "../../explorer/model/FavoriteCommand";
import { MavenProject } from "../../explorer/model/MavenProject";
import { Settings } from "../../Settings";
import { executeInTerminal } from "../../utils/mavenUtils";

/**
 * Run a favorite command, either the one provided directly (e.g. from the explorer), or one picked from the favorites
 * configured for the given project.
 */
export async function runFavoriteCommandsHandler(target?: FavoriteCommand | MavenProject): Promise<void> {
    let selectedCommand: FavoriteCommand | undefined;
    if (target instanceof FavoriteCommand) {
        selectedCommand = target;
    } else {
        if (!target) {
            return;
        }
        const favorites: FavoriteCommand[] = Settings.Terminal.favorites(target) ?? [];
        if (favorites.length === 0) {
            coc.window.showInformationMessage("Found no favorite commands. You can specify `maven.terminal.favorites` in Settings.");
            return;
        }
        selectedCommand = (
            await coc.window.showQuickPick(
                favorites.map((item) => ({ value: item, label: item.alias ?? item.command, description: item.command })),
                { placeHolder: "Select a favorite command ...", matchOnDescription: true }
            )
        )?.value;
    }

    if (selectedCommand) {
        await executeInTerminal({
            command: selectedCommand.debug ? `${selectedCommand.command} -X` : selectedCommand.command,
            pomFile: selectedCommand.project.pomPath
        });
    }
}
