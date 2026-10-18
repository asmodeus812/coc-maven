import * as coc from "coc.nvim";
import * as fs from "fs";
import * as path from "path";

/**
 * Makes `:help coc-maven` work. coc does not put an extension on the runtimepath, and putting the extension folder
 * there would make coc load the extension again, so the help page is copied to a folder of its own in the storage of
 * the extension, tagged there and that folder is added to the runtimepath.
 */
export async function registerHelp(context: coc.ExtensionContext): Promise<void> {
    const root: string = path.join(context.storagePath, "runtime");
    const doc: string = path.join(root, "doc");
    await fs.promises.mkdir(doc, { recursive: true });
    await fs.promises.copyFile(path.join(context.extensionPath, "doc", "coc-maven.txt"), path.join(doc, "coc-maven.txt"));
    await coc.workspace.nvim.command(`silent! helptags ${await coc.workspace.nvim.call("fnameescape", [doc])}`);
    const runtimepath: string = (await coc.workspace.nvim.getOption("runtimepath")) as string;
    if (!runtimepath.split(",").includes(root)) {
        await coc.workspace.nvim.setOption("runtimepath", `${runtimepath},${root}`);
    }
}
