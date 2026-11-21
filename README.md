# coc-maven

Maven support for [coc.nvim](https://github.com/neoclide/coc.nvim): a project
explorer, commands that run goals, lifecycle phases and favorite command lines,
completion, hover, go-to-definition, code actions and conflict diagnostics for
`pom.xml`, dependency commands, project and module creation from archetypes,
and a search for the artifact behind an unresolved Java type.

This README covers installation, setup and configuration. Every command and
feature is described in the help page, available once the extension is
active, without `:helptags`:

```vim
:help coc-maven
```

## Requirements

- Neovim or Vim with [coc.nvim](https://github.com/neoclide/coc.nvim) 0.0.82
  or later.
- Maven: `mvn` in `$PATH`, a Maven wrapper (`mvnw`, `mvnw.cmd`) in the
  project, or an executable that `maven.executable.path` points to.
- A JDK that Maven can find through `JAVA_HOME`.
- Optional: `coc-java` (or `coc-java-dev`). It provides the artifact index
  for completion and the artifact searcher, and reloads and imports the Java
  projects. The artifact index only works when the language server runs in
  standard mode.
- Optional: `coc-xml`. When it is active, the extension leaves out its own
  schema completion and schema hover for `pom.xml`.
- Network access to `search.maven.org` and `repo1.maven.org` for the artifact
  and version search, and to `repo.maven.apache.org` to update the archetype
  catalog.

## Installation

Install the extension from its repository:

```vim
:CocInstall https://github.com/asmodeus812/coc-maven
```

The extension starts when you open a Java file or a workspace that contains a
`pom.xml` in its root or one folder below.

## Setup

### The filetype of pom.xml

The pom features need the filetype `xml` for `pom.xml`. If your Vim setup
gives it another filetype, map it:

```lua
vim.g.coc_filetype_map = {
    ['pom.xml'] = 'xml',
}
```

### JAVA_HOME

Maven needs `JAVA_HOME`. Set it in the environment that starts Neovim, or give
it to the extension with `maven.terminal.customEnv` (see
[Terminal and environment](#terminal-and-environment)):

```json
{
    "maven.terminal.customEnv": [
        {
            "environmentVariable": "JAVA_HOME",
            "value": "/usr/lib/jvm/java-21-openjdk"
        },
        {
            "environmentVariable": "MAVEN_OPTS",
            "value": "-Xms1024m -Xmx4096m"
        }
    ]
}
```

On Windows, escape backslashes in the value:
`"C:\\Program Files\\Java\\jdk-21"`.

## Configuration

Set these keys in `coc-settings.json` (`:CocConfig` opens it). The keys are
grouped by namespace. Each group says how its keys are read:

- **Per project**: the key is read for the `pom.xml` at hand, so the
  `.vim/coc-settings.json` of the workspace folder that contains the pom
  overrides your user value for the projects in it.
- **For the editor**: the key is read without a pom. coc resolves it against
  its current workspace root, so it has one value for all projects at a time.

### Maven executable

`maven.executable.*`, read per project.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.executable.path` | string | `""` | Path of the Maven executable, for example `/usr/local/bin/mvn`. |
| `maven.executable.preferMavenWrapper` | boolean | `true` | Use the Maven wrapper of the project when it has one. |
| `maven.executable.options` | string or array of string | `""` | Options added to every Maven command line, for example `-o -T 1C`. |

The extension takes the first Maven it finds:

1. `maven.executable.path`, when it is not empty. A leading `~` is expanded.
2. The wrapper, when `maven.executable.preferMavenWrapper` is on: `mvnw`
   (`mvnw.cmd` on Windows) in the folder of the pom or the nearest parent
   folder up to the workspace folder.
3. `mvn` from `$PATH`.

When it finds none, it asks for the path and writes the answer to
`maven.executable.path` in your user `coc-settings.json`. A relative path, or
one inside a workspace folder, needs a confirmation once per session
(`:help coc-maven-executable`).

`maven.executable.options` takes a string, with quotes around arguments that
contain spaces, or an array. These two are equal:

```json
{
    "maven.executable.options": "-o -DskipTests"
}
```

```json
{
    "maven.executable.options": ["-o", "-DskipTests"]
}
```

All three keys apply to the next Maven run.

### Settings file

Read for the editor.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.settingsFile` | string or null | `null` | The Maven `settings.xml`, passed as `-s` to every Maven run, and read for `<localRepository>`. |

The file goes as `-s <file>` to every Maven run, in the terminal and in the
background, whichever executable the lookup above picks. The extension also
reads `<localRepository>` from it to find the local repository; without the
setting it reads `~/.m2/settings.xml`, and without a `<localRepository>` it
uses `~/.m2/repository`. A change looks up the local repository again the same
way, and the output channel `maven` logs where it is.

Keep `-s` out of `maven.executable.options`: Maven would get `-s` twice, and
the local repository lookup only reads `maven.settingsFile`.

### Terminal and environment

`maven.terminal.*`, read per project.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.terminal.customEnv` | array of objects | `[]` | Environment variables for Maven, in the terminal and in background runs. |
| `maven.terminal.favorites` | array of objects | two entries | Favorite Maven command lines, listed in the explorer and by the favorites command. |

Each `maven.terminal.customEnv` object has a non-empty string
`environmentVariable` and a string `value`. A name that is not made of
letters, digits and underscores, or that starts with a digit, is skipped, in
the terminal and in background runs alike, and logged once in the output
channel `maven`. The terminal sets the variables before every command, in the
syntax of the shell in `$SHELL`: PowerShell, `cmd.exe`, `fish` and POSIX
shells, including WSL, where paths are converted with `wslpath`. A change
closes the Maven terminals.

Each favorite has the string `command` (goals and options, without `mvn`),
the optional string `alias`, the label in the lists, and the optional boolean
`debug`, which adds `-X` (Maven debug output) to the command line. The default
favorites:

```json
{
    "maven.terminal.favorites": [
        {
            "alias": "Install without tests",
            "command": "install -DskipTests"
        },
        {
            "alias": "Build without tests",
            "command": "clean package -DskipTests"
        }
    ]
}
```

The command that adds a favorite takes the list in effect for coc's current
workspace root, adds the new entry and writes the result to the
`.vim/coc-settings.json` of that workspace folder, which it creates when
needed. A change refreshes the explorer.

### Explorer

`maven.explorer.*`: `view` is read for the editor, `projectName` per project.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.explorer.view` | `"flat"` or `"hierarchical"` | `"hierarchical"` | The explorer lists all projects on one level, or nests modules below the project that declares them. |
| `maven.explorer.projectName` | string, one of five templates | `"${project.name}"` | The label of a project in the explorer. |

`maven.explorer.projectName` takes one of `${project.name}`,
`${project.artifactId}`, `${project.artifactId}-${project.version}`,
`${project.groupId}.${project.artifactId}` and
`${project.groupId}.${project.artifactId}-${project.version}`. A project
without a `<name>` shows its artifactId for `${project.name}`.

A change of either key refreshes the explorer. The commands that switch the
explorer layout write `maven.explorer.view` to your user `coc-settings.json`.

### Pom files

`maven.pomfile.*`: `prefetchEffectivePom` is read per project, the others for
the editor.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.pomfile.globPattern` | string | `"**/pom.xml"` | Finds the poms of each workspace folder, and the poms the file watcher observes. |
| `maven.pomfile.prefetchEffectivePom` | boolean | `true` | Compute the effective poms of a build in the background when its projects load. |
| `maven.pomfile.autoUpdateEffectivePOM` | boolean | `true` | Recompute the effective pom right after its `pom.xml` changes on disk; off, on its next use. |

A change of `maven.pomfile.globPattern` refreshes the explorer, which searches
the poms again with the new pattern, and the file watcher observes the new
pattern from then on. The pattern does not decide which buffers get
the pom features: those attach to the filetype `xml` with the pattern
`**/{pom.xml,*.pom}`.

`maven.pomfile.prefetchEffectivePom` covers the root poms and the modules they
list, so hover and the explorer have them ready. Any other `pom.xml` inside a
project, such as test inputs or samples, computes on first use. It applies to
projects that load after the change; `maven.pomfile.autoUpdateEffectivePOM`
applies to the next change of a pom.

### Project discovery

Read per workspace folder.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.excludedFolders` | array of string | five globs | Folders that the search for poms skips. |

The default:

```json
{
    "maven.excludedFolders": [
        "**/.*",
        "**/node_modules",
        "**/target",
        "**/bin",
        "**/archetype-resources"
    ]
}
```

A change refreshes the explorer, which searches the poms again without the
excluded folders.

### Pom editing

Read for the editor.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.completion.gavEnabled` | boolean | `true` | Look up `groupId`, `artifactId` and `version` candidates on Maven Central. |
| `maven.dependency.enableConflictDiagnostics` | boolean | `true` | Report dependency conflicts as warnings, and compute the dependency trees for them in the background. |

`maven.completion.gavEnabled` set to `false` turns off only the Maven Central
lookups, from the next completion on; the candidates from the Java language
server index and the local repository stay.

`maven.dependency.enableConflictDiagnostics` set to `false` clears every
reported conflict right away and stops computing dependency trees in the
background; set back to `true`, it reports the conflicts of the open poms
again, and of the others when they are opened.

### New projects

Read for the editor.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.projectOpenBehavior` | `"Interactive"`, `"Open"` or `"Cancel"` | `"Interactive"` | What happens after a project or module is created. |

`"Open"` opens the folder of the new project, `"Cancel"` does nothing, and
`"Interactive"` (and any other value) asks.

### Generated files

Read per project.

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.outputDirectory` | string | `""` | Folder for the files Maven generates for a project. Empty uses the coc storage folder of the extension. |

The files Maven generates for a project stay on disk under readable names, so
other tools can use them too. They go to the folder that
`maven.outputDirectory` names. Empty, the default, is a folder in the coc
storage folder of the extension named after the md5 of the absolute path of
the pom, for example `coc-maven-data/0176eccb65246d7b089fcc864b370a8a/`.
`"target/generated"` puts the files next to the pom of each project instead:

```
my-app/target/generated/
    effective-pom.xml
    dependency-tree.txt
    profiles.txt
    plugins/org.apache.maven.plugins_maven-compiler-plugin_3.13.0.txt
```

Next to the effective pom and the dependency tree, a `.mtime` file records
the state of the poms they belong to; a result is computed again only after a
pom changes. With a folder inside `target`, `mvn clean` removes the files;
they come back on their next use.

A relative path resolves against the folder of the pom. `${workspaceFolder}`,
`${projectDir}`, `${relativeProjectDir}` (the folder of the pom inside its
workspace folder), environment variables (`${env:NAME}`, `${NAME}`, `$NAME`)
and a leading `~` are expanded. A path without `${projectDir}` or
`${relativeProjectDir}` is shared by every project, so their files would
overwrite each other. One folder per project below the workspace folder:

```json
{
    "maven.outputDirectory": "${workspaceFolder}/.coc-maven/${relativeProjectDir}"
}
```

A change applies to the next result that is computed; the files in the old
folder stay where they are. `:CocCommand maven.project.generatedResources`
lists the generated files of a project and opens the one you pick. See
`:help coc-maven-generated`.

## Files

The extension writes:

- the files Maven generates for a project, in `maven.outputDirectory`; see
  [Generated files](#generated-files);
- the command history of each pom, in the coc storage folder of the
  extension;
- the archetype catalog, when you update it, in the coc storage folder of the
  extension (`:help coc-maven-archetype`);
- a copy of the artifact index for the artifact searcher, in the coc storage
  folder of the extension;
- a copy of the help page and its tags, in the coc storage folder of the
  extension, which it adds to `'runtimepath'`.

It edits your poms only through the dependency, module and project commands.

## Troubleshooting

- **"Maven not found in PATH"**: install Maven or a wrapper, or set
  `maven.executable.path`; see [Maven executable](#maven-executable) for the
  lookup order.
- **Completion, hover and definition do nothing in a pom**: check
  `:set filetype?` in the pom buffer. It must be `xml`; see
  [The filetype of pom.xml](#the-filetype-of-pomxml).
- **No groupId or artifactId candidates**: Maven Central needs network access
  and `maven.completion.gavEnabled` on, and the Java language server index
  needs `coc-java` in standard mode.
- **The explorer is empty**: no `pom.xml` was found; check
  `maven.excludedFolders` and `maven.pomfile.globPattern`.
- **Maven fails**: open its output with
  `:CocCommand workspace.showOutput maven`. The channel shows each background
  command line, the `JAVA_HOME` set in `maven.terminal.customEnv`, and the
  local repository.

## Development

```sh
npm install        # installs the dependencies and builds lib/index.js
npm run build      # builds lib/index.js with esbuild
npm run watch      # rebuilds on change
make update        # rebuilds server/com.microsoft.java.maven.plugin.jar
```

`NODE_ENV=production` minifies the bundle, `NODE_ENV=development` writes a
source map. `make update` builds the Java language server plugin from
`microsoft/vscode-maven`; it needs `git`, a JDK and Maven.

To try a checkout, add the folder to `'runtimepath'`, for example
`set runtimepath^=/path/to/coc-maven`, after building it.

## License

MIT, see `LICENSE`. coc-maven is a fork of
[vscode-maven](https://github.com/microsoft/vscode-maven) by Microsoft,
adapted to coc.nvim.
