// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { IEffectivePom } from "./explorer/model/IEffectivePom";
import { MavenProject } from "./explorer/model/MavenProject";
import { getDependencyTree } from "./handlers/dependency/showDependenciesHandler";
import { MavenProjectManager } from "./project/MavenProjectManager";
import { Utils } from "./utils/Utils";

/**
 * URI patterns and authorities.
 * coc-maven://dependencies/<pom-path>/Dependencies?<pom-path>
 * coc-maven://effective-pom/<pom-path>/EffectivePOM.xml?<pom-path>
 * coc-maven://local-repository/<pom-path-in-local-maven-repository>
 */
class MavenContentProvider implements coc.TextDocumentContentProvider {
    public readonly onDidChange: coc.Event<coc.Uri>;
    private readonly _onDidChangeEmitter: coc.Emitter<coc.Uri>;

    constructor() {
        this._onDidChangeEmitter = new coc.Emitter<coc.Uri>();
        this.onDidChange = this._onDidChangeEmitter.event;
    }

    public invalidate(uri: coc.Uri): void {
        this._onDidChangeEmitter.fire(uri);
    }

    public async provideTextDocumentContent(uri: coc.Uri, _token: coc.CancellationToken): Promise<string | undefined> {
        if (uri.scheme !== "coc-maven") {
            throw new Error(`Scheme ${uri.scheme} not supported by this content provider.`);
        }

        const pomPath = uri.query;
        switch (uri.authority) {
            case "dependencies":
                return getDependencyTree(pomPath);
            case "effective-pom": {
                const project: MavenProject | undefined = MavenProjectManager.get(pomPath);
                if (project) {
                    const effectivePom: IEffectivePom = await project.getEffectivePom();
                    return effectivePom.ePomString;
                } else {
                    return Utils.getEffectivePom(pomPath);
                }
            }
            case "local-repository": {
                const fsUri = uri.with({ scheme: "file", authority: "" });
                return await coc.workspace.readFile(fsUri.toString());
            }
            default:
        }
        return undefined;
    }
}

export const contentProvider: MavenContentProvider = new MavenContentProvider();
