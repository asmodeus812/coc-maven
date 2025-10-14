// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim"
import * as _ from "lodash"
import { FavoriteCommand } from "../../explorer/model/FavoriteCommand"
import { Settings } from "../../Settings"

export async function runFavoriteCommandsHandler(command: FavoriteCommand): Promise<void> {
    const favorites: FavoriteCommand[] | undefined = Settings.Terminal.favorites(command?.project);
    if (!favorites || _.isEmpty(favorites)) {
        const BUTTON_OPEN_SETTINGS = "Open Settings";
        const choice: string | undefined = await coc.window.showInformationMessage(
            "Found no favorite commands. You can specify `maven.terminal.favorites` in Settings.",
            BUTTON_OPEN_SETTINGS
        );
        if (choice === BUTTON_OPEN_SETTINGS) {
            await coc.commands.executeCommand("workbench.action.openSettings", "maven.terminal.favorites");
        }
        return;
    }

    let selectedCommand: FavoriteCommand | undefined = command;
    selectedCommand ??= await coc.window
        .showQuickPick(
            favorites.map((item) => ({
                value: item,
                label: item.alias,
                description: item.command
            })),
            {
                placeHolder: "Select a favorite command ...",
                matchOnDescription: true
            }
        )
        .then((item) => (item ? item.value : undefined));
    if (!selectedCommand) {
        return;
    }
}
