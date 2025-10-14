// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {FavoriteCommand} from "../../explorer/model/FavoriteCommand";
import {executeInTerminal} from "../../utils/mavenUtils";

export async function runFavoriteCommandsHandler(command: FavoriteCommand): Promise<void> {
    const config: any = {
        command: command.command,
        pomfile: command.project.pomPath,
        projectName: command.project.artifactId
    };
    await executeInTerminal(config);
}
