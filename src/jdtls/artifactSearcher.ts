// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as coc from "coc.nvim";
import { registerCommand } from "../utils/uiUtils";
import { executeJavaLanguageServerCommand, getJavaExtension, isJavaExtActivated } from "./commands";

// Please refer to https://help.eclipse.org/2019-06/index.jsp?topic=%2Forg.eclipse.jdt.doc.isv%2Freference%2Fapi%2Fconstant-values.html
const UNDEFINED_TYPE = "16777218"; // e.g. Unknown var;
const UNDEFINED_NAME = "570425394"; // e.g. Unknown.foo();

const COMMAND_SEARCH_ARTIFACT = "maven.project.artifactSearch";
const TITLE_RESOLVE_UNKNOWN_TYPE = "Add dependency for this type";

export function registerArtifactSearcher(context: coc.ExtensionContext): void {
    const javaExt: coc.Extension<any> | undefined = getJavaExtension();
    if (javaExt) {
        const resolver: TypeResolver = new TypeResolver(path.join(context.extensionPath, "resources", "IndexData"));

        registerCommand(context, COMMAND_SEARCH_ARTIFACT, async (param: any) => await resolver.pickAndAddDependency(param), true);

        context.subscriptions.push(
            coc.languages.registerHoverProvider("java", {
                provideHover(
                    document: coc.TextDocument,
                    position: coc.Position,
                    _token: coc.CancellationToken
                ): coc.ProviderResult<coc.Hover> {
                    return resolver.getArtifactsHover(document, position);
                }
            })
        );

        context.subscriptions.push(
            coc.languages.registerCodeActionProvider(
                "java",
                {
                    provideCodeActions(
                        document: coc.TextDocument,
                        range: coc.Range,
                        codeActionContext: coc.CodeActionContext,
                        _token: coc.CancellationToken
                    ): coc.ProviderResult<(coc.Command | coc.CodeAction)[]> {
                        return resolver.getArtifactsCodeActions(document, codeActionContext, range);
                    }
                },
                undefined
            )
        );
    }
}

class TypeResolver {
    private readonly dataPath: string;
    private initialized = false;

    constructor(dataPath: string) {
        this.dataPath = dataPath;
    }

    public async initialize(): Promise<void> {
        if (!this.initialized) {
            await executeJavaLanguageServerCommand("java.maven.initializeSearcher", this.dataPath);
            this.initialized = true;
        }
    }

    public getArtifactsHover(document: coc.TextDocument, position: coc.Position): coc.Hover | undefined {
        if (!isJavaExtActivated()) {
            return undefined;
        }

        if (!this.initialized) {
            this.initialize()
                .then(() => {
                    this.getArtifactsHover(document, position);
                })
                .catch(() => {
                    coc.window.showErrorMessage("Unable to initialize artifact searcher");
                });
            return undefined;
        }

        const diagnostics: coc.Diagnostic[] = coc.diagnosticManager
            .getDiagnosticsInRange({ uri: document.uri } as coc.TextDocumentIdentifier, coc.Range.create(position, position))
            .filter((diagnostic: coc.Diagnostic) => {
                return (
                    diagnosticIndicatesUnresolvedType(diagnostic, document) &&
                    isAfterOrEqual(position, diagnostic.range.start) &&
                    isBeforeOrEqual(position, diagnostic.range.end)
                );
            });
        if (diagnostics?.length > 0) {
            const diagnostic: coc.Diagnostic = diagnostics[0];
            const line: number = diagnostic.range.start.line;
            const character: number = diagnostic.range.start.character;
            const className: string = document.getText(diagnostic.range);
            const length: number = document.offsetAt(diagnostic.range.end) - document.offsetAt(diagnostic.range.start);
            const param: any = {
                className,
                uri: encodeBase64(document.uri.toString()),
                line,
                character,
                length
            };
            const message = `\uD83D\uDC49 ${TITLE_RESOLVE_UNKNOWN_TYPE} \n\nThe maven extension will automatically lookup for a matching artifact based on your current hover position. \n\nPlease pick an extension from the list to be added to your build file, or cancel the selection`;
            coc.commands.executeCommand(COMMAND_SEARCH_ARTIFACT, param);
            return {
                contents: {
                    value: message,
                    kind: coc.MarkupKind.Markdown
                }
            } as coc.Hover;
        } else {
            return undefined;
        }
    }

    public getArtifactsCodeActions(
        document: coc.TextDocument,
        context: coc.CodeActionContext,
        _selectRange: coc.Range
    ): coc.CodeAction[] | undefined {
        if (!isJavaExtActivated()) {
            return undefined;
        }

        if (!this.initialized) {
            this.initialize()
                .then(() => {
                    this.getArtifactsCodeActions(document, context, _selectRange);
                })
                .catch(() => {
                    coc.window.showErrorMessage("Unable to initialize artifact searcher");
                });
            return undefined;
        }

        const diagnostics: coc.Diagnostic[] = context.diagnostics.filter((diagnostic) => {
            return diagnosticIndicatesUnresolvedType(diagnostic, document);
        });
        if (diagnostics?.length > 0) {
            const range: coc.Range = diagnostics[0].range;
            const className: string = document.getText(range);
            const uri: string = document.uri.toString();
            const line: number = range.start.line;
            const character: number = range.start.character;
            const length: number = document.offsetAt(range.end) - document.offsetAt(range.start);
            const command: coc.Command = {
                title: TITLE_RESOLVE_UNKNOWN_TYPE,
                command: COMMAND_SEARCH_ARTIFACT,
                arguments: [
                    {
                        className,
                        uri: encodeBase64(uri),
                        line,
                        character,
                        length
                    }
                ]
            };
            const codeAction: coc.CodeAction = {
                title: `${TITLE_RESOLVE_UNKNOWN_TYPE} '${className}'`,
                command,
                kind: coc.CodeActionKind.QuickFix
            };
            return [codeAction];
        } else {
            return [];
        }
    }

    public async pickAndAddDependency(param: any): Promise<void> {
        if (!isJavaExtActivated()) {
            return;
        }

        if (!this.initialized) {
            this.initialize().catch();
            return;
        }

        const pickItem: any = await coc.window.showQuickPick(getArtifactsPickItems(param.className), {
            placeHolder: "Select the artifact you want to add"
        });
        if (pickItem === undefined) {
            return;
        }
        param.uri = decodeBase64(param.uri);
        const edits: coc.WorkspaceEdit[] = await getWorkSpaceEdits(pickItem, param);
        await applyEdits(coc.Uri.parse(param.uri), edits);
    }
}

async function getArtifactsPickItems(className: string): Promise<coc.QuickPickItem[]> {
    const searchParam: ISearchArtifactParam = {
        searchType: SearchType.className,
        className
    };
    const response: IArtifactSearchResult[] = await executeJavaLanguageServerCommand("java.maven.searchArtifact", searchParam);
    const picks: (coc.QuickPickItem & { artifactInfo: string })[] = [];
    for (let i = 0; i < Math.min(Math.round(response.length / 5), 5); i += 1) {
        const arr: string[] = [response[i].groupId, ":", response[i].artifactId, ":", response[i].version];
        picks.push({
            label: `(matching) - ${response[i].className}`,
            description: `${response[i].fullClassName}`,
            artifactInfo: arr.join("")
        });
    }
    for (let i: number = Math.min(Math.round(response.length / 5), 5); i < response.length; i += 1) {
        const arr: string[] = [response[i].groupId, ":", response[i].artifactId, ":", response[i].version];
        picks.push({
            label: response[i].className,
            description: `${response[i].fullClassName}`,
            artifactInfo: arr.join("")
        });
    }
    return picks;
}

async function applyEdits(uri: coc.Uri, edits: any): Promise<void> {
    // if the pom is invalid, no change occurs in edits[2], there are at most 3 editrs in the response, one is the import action,
    // the second one is the actual code replacement where the dependency is going to be/is used. The final edit is in the pom file,
    // if the pom file does not have the dependency already it will be added
    if (Object.keys(edits[2].changes).length > 0) {
        // 0: import 1: replace, this will be in the target source file/file
        await coc.commands.executeCommand("maven.project.resource.open", uri);
        await coc.workspace.applyEdit(edits[0]);
        await coc.workspace.applyEdit(edits[1]);

        // 2: pom
        if (edits[2].changes[Object.keys(edits[2].changes)[0]].length === 0) {
            // already has this dependency, we can skip this edit
            return;
        }
        await coc.workspace.applyEdit(edits[2]);
    } else {
        coc.window.showInformationMessage("The pom.xml file does not exist or is invalid.");
    }
}

async function getWorkSpaceEdits(pickItem: any, param: any): Promise<coc.WorkspaceEdit[]> {
    return await executeJavaLanguageServerCommand(
        "java.maven.addDependency",
        pickItem.description,
        pickItem.artifactInfo,
        param.uri,
        param.line,
        param.character,
        param.length
    );
}

function startsWithCapitalLetter(word: string): boolean {
    return word.charCodeAt(0) >= 65 && word.charCodeAt(0) <= 90;
}

function diagnosticIndicatesUnresolvedType(diagnostic: coc.Diagnostic, document: coc.TextDocument): boolean {
    return (
        UNDEFINED_TYPE === diagnostic.code ||
        (UNDEFINED_NAME === diagnostic.code && startsWithCapitalLetter(document.getText(diagnostic.range)))
    );
}

function encodeBase64(content: string): string {
    return Buffer.from(content, "utf8").toString("base64");
}

function decodeBase64(content: string): string {
    return Buffer.from(content, "base64").toString("utf8");
}

export interface IArtifactSearchResult {
    groupId: string;
    artifactId: string;
    version: string;
    className: string;
    fullClassName: string;
    usage: number;
    kind: number;
}

export enum SearchType {
    className = "CLASSNAME",
    identifier = "IDENTIFIER"
}

export interface ISearchArtifactParam {
    searchType: SearchType;
    className?: string;
    groupId?: string;
    artifactId?: string;
}

function isAfterOrEqual(position: coc.Position, start: coc.Position): boolean {
    if (position.line > start.line) return true;
    if (position.line < start.line) return false;
    return position.character >= start.character;
}

function isBeforeOrEqual(position: coc.Position, end: coc.Position): boolean {
    if (position.line < end.line) return true;
    if (position.line > end.line) return false;
    return position.character <= end.character;
}
