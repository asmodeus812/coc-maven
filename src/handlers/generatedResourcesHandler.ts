import * as coc from "coc.nvim";
import * as fse from "fs-extra";
import * as path from "path";
import { MavenProject } from "../explorer/model/MavenProject";
import { DEPENDENCY_TREE_FILE, EFFECTIVE_POM_FILE, PROFILES_FILE } from "../utils/mavenUtils";
import { outputDirectory } from "../utils/outputPaths";

interface GeneratedFileItem extends coc.QuickPickItem {
    file: string;
}

// the files of the output folder in the order the quick pick lists them, the plugin descriptions follow
const NAMED_FILES: [string, string][] = [
    [EFFECTIVE_POM_FILE, "Effective POM"],
    [DEPENDENCY_TREE_FILE, "Dependency tree"],
    [PROFILES_FILE, "Profiles"]
];

/**
 * The generated files of a project that exist on disk, see outputDirectory. The .mtime files next to them are internal
 * and left out, a file appears once maven computed it.
 */
export async function generatedFiles(pomPath: string): Promise<GeneratedFileItem[]> {
    const directory: string = outputDirectory(pomPath);
    const items: GeneratedFileItem[] = [];
    for (const [name, description] of NAMED_FILES) {
        const file: string = path.join(directory, name);
        if (await fse.pathExists(file)) {
            items.push({ label: name, description, file });
        }
    }
    const pluginsDirectory: string = path.join(directory, "plugins");
    const plugins: string[] = (await fse.pathExists(pluginsDirectory)) ? await fse.readdir(pluginsDirectory) : [];
    for (const name of plugins.filter((plugin: string) => plugin.endsWith(".txt")).sort()) {
        items.push({ label: `plugins/${name}`, description: "Plugin goals", file: path.join(pluginsDirectory, name) });
    }
    return items;
}

/**
 * Lists the generated files of a project in a quick pick and opens the one picked.
 */
export async function openGeneratedResource(project: MavenProject, open: (file: string) => Promise<unknown>): Promise<void> {
    const items: GeneratedFileItem[] = await generatedFiles(project.pomPath);
    if (items.length === 0) {
        coc.window.showInformationMessage(
            `No generated files for ${project.name} yet, Maven writes them to ${outputDirectory(project.pomPath)} on first use`
        );
        return;
    }
    const picked: GeneratedFileItem | undefined = await coc.window.showQuickPick(items, {
        title: `Generated files of ${project.name}`,
        matchOnDescription: true
    });
    if (picked !== undefined) {
        await open(picked.file);
    }
}
