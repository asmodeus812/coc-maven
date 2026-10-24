// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as coc from "coc.nvim";
import * as fse from "fs-extra";
import { UserError } from "../../utils/errorUtils";
import { dependenciesContentUri, selectProjectIfNecessary } from "../../utils/uiUtils";

export async function showDependenciesHandler(options: any): Promise<void> {
    let pomPath: string | undefined;
    if (options?.pomPath) {
        // for nodes from Maven explorer
        pomPath = options.pomPath;
    } else if (options?.projectBasePath) {
        // for "Maven dependencies" nodes from Project Manager
        pomPath = path.join(options.projectBasePath, "pom.xml");
    } else if (options?.project?.pomPath) {
        // for "Dependencies" node from module in Maven explorer
        pomPath = options.project.pomPath;
    } else {
        pomPath = (await selectProjectIfNecessary())?.pomPath;
    }

    if (!pomPath || !(await fse.pathExists(pomPath))) {
        throw new UserError(`Specified POM ${pomPath} does not exist.`);
    }

    const uri = dependenciesContentUri(pomPath);
    await coc.commands.executeCommand("maven.project.resource.open", uri);
}
