import * as coc from "coc.nvim";

// tslint:disable-next-line: export-name
export function getBaseIndentation(document: coc.TextDocument, offset: number): string {
    const closingTagPosition: coc.Position = document.positionAt(offset);
    return document.getText(coc.Range.create(coc.Position.create(closingTagPosition.line, 0), closingTagPosition));
}

export function getInnerIndentation(location: coc.Uri): string {
    const stringUri: string = location.toString();
    const textEditor: coc.TextEditor | undefined = coc.window.activeTextEditor;
    let options: coc.TextEditorOptions = textEditor?.options as coc.TextEditorOptions;
    if (!options || textEditor?.document.uri !== stringUri) {
        for (const editor of coc.window.visibleTextEditors) {
            if (stringUri === editor?.document.uri) {
                options = editor.options;
                break;
            }
        }
        options =
            options ??
            ({
                tabSize: 4,
                insertSpaces: true
            } as coc.TextEditorOptions);
    }
    return options.insertSpaces && typeof options.tabSize === "number" ? " ".repeat(options.tabSize) : "\t";
}

export async function focusResourceLocation(location: coc.Uri | string, alternateWindowId?: number, openCommand?: string): Promise<void> {
    const stringUri: string = typeof location === "string" ? location : location.toString();
    const textEditor: coc.TextEditor | undefined = coc.window.activeTextEditor;
    if (textEditor?.document.uri !== stringUri) {
        let visibleEditor: coc.TextEditor | undefined = undefined;
        for (const editor of coc.window.visibleTextEditors) {
            if (stringUri === editor?.document.uri) {
                visibleEditor = editor;
                break;
            }
        }
        if (visibleEditor?.winid) {
            await coc.workspace.nvim.call("win_gotoid", [visibleEditor.winid]);
            return;
        }
    }

    if (alternateWindowId !== undefined) {
        await coc.workspace.nvim.call("win_gotoid", [alternateWindowId]);
    }
    await coc.workspace.jumpTo(location, null, openCommand);
}

export function constructDependencyNode(options: {
    gid: string;
    aid: string;
    version?: string;
    dtype?: string;
    classifier?: string;
    baseIndent: string;
    indent: string;
    eol: string;
}): string {
    const { gid, aid, version, dtype, classifier, baseIndent, indent, eol } = options;

    // init the array with the required params
    const builder: string[] = [eol, "<dependency>", `${indent}<groupId>${gid}</groupId>`, `${indent}<artifactId>${aid}</artifactId>`];
    if (version) {
        builder.push(`${indent}<version>${version}</version>`);
    }

    // add the packaging type if present and not the default
    if (dtype !== undefined && dtype !== "jar") builder.push(`${indent}<type>${dtype}</type>`);

    // add the classifier if present
    if (classifier !== undefined) builder.push(`${indent}<type>${classifier}</type>`);

    // cap the end of the array with the closing tag
    builder.push(`</dependency>${eol}`);

    // join the array together with the newlines and indents
    return builder.join(`${eol}${baseIndent}${indent}`);
}

export function constructDependenciesNode(options: {
    gid: string;
    aid: string;
    version?: string;
    dtype?: string;
    classifier?: string;
    baseIndent: string;
    indent: string;
    eol: string;
}): string {
    const { gid, aid, version, dtype, classifier, baseIndent, indent, eol } = options;

    // use the existing dependency method to build that section, just add an extra bump to the indent
    const dependencyNode = constructDependencyNode({ gid, aid, version, dtype, baseIndent: baseIndent + indent, classifier, indent, eol });

    // wrap the dependency with the dependencies node
    return [eol, "<dependencies>", dependencyNode, `</dependencies>${eol}`].join(`${eol}${baseIndent}${indent}`);
}

export function constructDependencyManagementNode(options: {
    gid: string;
    aid: string;
    version: string;
    dtype?: string;
    classifier?: string;
    baseIndent: string;
    indent: string;
    eol: string;
}): string {
    const { gid, aid, version, dtype, classifier, baseIndent, indent, eol } = options;

    // use the existing dependencies method to build that section, just add an extra bump to the indent
    const dependenciesNode = constructDependenciesNode({
        gid,
        aid,
        version,
        dtype,
        baseIndent: baseIndent + indent,
        classifier,
        indent,
        eol
    });

    // wrap the dependencies with the dependencyManagement node
    return [eol, "<dependencyManagement>", dependenciesNode, `</dependencyManagement>${eol}`].join(`${eol}${baseIndent}${indent}`);
}
