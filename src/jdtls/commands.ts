// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { JavaExtensionNotActivatedError } from "../utils/errorUtils";

const JAVA_EXECUTE_WORKSPACE_COMMAND = "java.execute.workspaceCommand";

const JAVA_COMMAND_MESSAGE_MAP = {
    ["java.maven.initializeSearcher"]: "Initializing artifact searcher...",
    ["java.maven.searchArtifact"]: "Sarching for a maven artifact...",
    ["java.maven.addDependency"]: "Adding dependency to build file...",
    ["java.maven.controlContext"]: "Evaluating control context..."
};

// tslint:disable-next-line:export-name
export function executeJavaLanguageServerCommand<R>(...rest: unknown[]): Promise<R> {
    if (!isJavaExtEnabled()) {
        throw new JavaExtensionNotActivatedError(`Cannot command ${JAVA_EXECUTE_WORKSPACE_COMMAND} java extension is not enabled.`);
    }
    const argumentsArray: any[] = rest;
    return coc.window.withProgress(
        { title: JAVA_COMMAND_MESSAGE_MAP[argumentsArray[0]] || `Executing an unknown command ${argumentsArray[0]}...` },
        () => {
            return coc.commands.executeCommand<R>(JAVA_EXECUTE_WORKSPACE_COMMAND, ...rest);
        }
    );
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
