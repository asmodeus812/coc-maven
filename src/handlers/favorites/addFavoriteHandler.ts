// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import { Settings } from "../../Settings";
import * as coc from "coc.nvim";

export async function addFavoriteHandler() {
    const command = await coc.window.requestInput("Add favorite", "", {
        placeholder: "Input a command for your favorite execute, e.g. clean install"
    });

    if (!command) {
        return;
    }

    Settings.storeFavorite({ command, debug: false });
}
