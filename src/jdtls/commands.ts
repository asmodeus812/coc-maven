// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { JavaExtensionNotActivatedError } from "../utils/errorUtils";

const JAVA_EXECUTE_WORKSPACE_COMMAND = "java.execute.workspaceCommand";

// tslint:disable-next-line:export-name
export function executeJavaLanguageServerCommand<R>(...rest: unknown[]): Promise<R> {
    if (!isJavaExtEnabled()) {
        throw new JavaExtensionNotActivatedError(
            `Cannot execute command ${JAVA_EXECUTE_WORKSPACE_COMMAND}, VS Code Java Extension is not enabled.`
        );
    }
    return coc.commands.executeCommand<R>(JAVA_EXECUTE_WORKSPACE_COMMAND, ...rest);
}

export function isJavaExtEnabled(): boolean {
    const javaExt: coc.Extension<unknown> | undefined = getJavaExtension();
    return !!javaExt;
}

export function isJavaExtActivated(): boolean {
    const javaExt: coc.Extension<unknown> | undefined = getJavaExtension();
    return !!javaExt && javaExt.isActive;
}

export function getJavaExtension(): coc.Extension<unknown> | undefined {
    const java = coc.extensions.getExtensionById("coc-java");
    if (!java || java == null || java === undefined) {
        return coc.extensions.getExtensionById("coc-java-dev");
    }
    return java;
}

export function isJavaLanguageServerStandard(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const javaExt: coc.Extension<any> | undefined = getJavaExtension();
    return javaExt?.exports?.serverMode === "Standard";
}
