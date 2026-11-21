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
  projects.
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

### Java and Maven

Maven needs `JAVA_HOME`. Set it in the environment that starts Neovim, or give
it to the extension with `maven.terminal.customEnv`:

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

To use a specific Maven, set `maven.executable.path`. A Maven `settings.xml`
outside `~/.m2/settings.xml` goes into `maven.settingsFile`. The extension
reads `<localRepository>` from the settings file to find the local repository,
which defaults to `~/.m2/repository`.

### The Java language server

Install `coc-java` for the artifact index and the artifact searcher. The
artifact index only works when the language server runs in standard mode.

## Configuration

Set these keys in `coc-settings.json` (`:CocConfig` opens it). The settings
come in two scopes:

- **Global** settings have one value for every project. Set them in your user
  `coc-settings.json`.
- **Per-project** settings are read for the `pom.xml` at hand, so the
  `.vim/coc-settings.json` of a workspace folder can override them for the
  projects in it.

### Global settings

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.settingsFile` | string or null | `null` | The Maven `settings.xml` for every Maven run, whichever executable runs it. Also the file read for `<localRepository>`. |
| `maven.explorer.view` | `"flat"` or `"hierarchical"` | `"hierarchical"` | The explorer lists all projects on one level, or nests modules below the project that declares them. |
| `maven.pomfile.globPattern` | string | `"**/pom.xml"` | Finds the poms of the workspace; the file watcher observes it too. |
| `maven.pomfile.autoUpdateEffectivePOM` | boolean | `true` | Recompute the effective pom of a project after its `pom.xml` changes on disk. |
| `maven.completion.gavEnabled` | boolean | `true` | Look up `groupId`, `artifactId` and `version` candidates on Maven Central. |
| `maven.dependency.enableConflictDiagnostics` | boolean | `true` | Report dependency conflicts as warnings. |
| `maven.projectOpenBehavior` | `"Interactive"`, `"Open"` or `"Cancel"` | `"Interactive"` | What happens after a project or module is created. |

### Per-project settings

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.executable.path` | string | `""` | Path of the Maven executable, for example `/usr/local/bin/mvn`. |
| `maven.executable.preferMavenWrapper` | boolean | `true` | Use the Maven wrapper of the project when it has one. |
| `maven.executable.options` | string or array of string | `""` | Options added to every Maven command, for example `-o -T 1C`. |
| `maven.terminal.customEnv` | array of objects | `[]` | Environment variables for Maven, in the terminal and in background runs. |
| `maven.terminal.favorites` | array of objects | two entries | Favorite Maven command lines, listed in the explorer and by the favorites command. |
| `maven.explorer.projectName` | string | `"${project.name}"` | The label of a project in the explorer. |
| `maven.excludedFolders` | array of string | five globs | Folders that the search for poms skips. |
| `maven.pomfile.prefetchEffectivePom` | boolean | `true` | Compute the effective poms of a build in the background when its projects load. |
| `maven.outputDirectory` | string | `""` | Folder for the files Maven generates for a project. Empty uses the coc storage folder of the extension. |

The sections below explain the settings that need more than one line.

### The Maven executable

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

### The settings file

`maven.settingsFile` is passed as `-s <file>` to every Maven run, in the
terminal and in the background, for every project and whichever executable
the lookup above picks. The extension also reads `<localRepository>` from it
to find the local repository; without the setting it reads
`~/.m2/settings.xml`, and without a `<localRepository>` it uses
`~/.m2/repository`. A change reloads the local repository location.

Keep `-s` out of `maven.executable.options`: Maven would get `-s` twice,
and the local repository lookup only reads `maven.settingsFile`.

### Environment variables

Each `maven.terminal.customEnv` object has a non-empty string
`environmentVariable` and a string `value`. A name that is not made of
letters, digits and underscores, or that starts with a digit, is skipped and
logged in the output channel `maven`. The terminal sets the variables in the
syntax of the shell in `$SHELL`: PowerShell, `cmd.exe`, `fish` and POSIX
shells, including WSL, where paths are converted with `wslpath`. A change
closes the Maven terminals.

### Favorites

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

The command that adds a favorite writes to `.vim/coc-settings.json` of the
workspace folder, which it creates when needed; that list replaces the user
list for the folder.

### The explorer and project discovery

`maven.explorer.projectName` takes one of `${project.name}`,
`${project.artifactId}`, `${project.artifactId}-${project.version}`,
`${project.groupId}.${project.artifactId}` and
`${project.groupId}.${project.artifactId}-${project.version}`. A project
without a `<name>` shows its artifactId for `${project.name}`.

The default of `maven.excludedFolders`:

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

`maven.pomfile.globPattern` does not decide which buffers get the pom
features: those attach to the filetype `xml` with the pattern
`**/{pom.xml,*.pom}`.

`maven.pomfile.prefetchEffectivePom` covers the root poms and the modules they
list, so hover and the explorer have them ready. Any other `pom.xml` inside a
project, such as test inputs or samples, computes on first use.

The explorer refreshes when `maven.explorer.view`,
`maven.pomfile.globPattern`, `maven.explorer.projectName` or
`maven.terminal.favorites` changes. The commands that switch the explorer
layout write `maven.explorer.view` to your user `coc-settings.json`.

### Generated files

The files Maven generates for a project stay on disk under readable names, so
other tools can use them too. They go to the folder that
`maven.outputDirectory` names. Empty, the default, is a folder in the coc
storage folder of the extension named after the md5 of the pom path, for
example `coc-maven-data/0176eccb65246d7b089fcc864b370a8a/`. Another tool finds
it by hashing the absolute path of the pom. `"target/generated"` puts the
files next to the pom of each project instead:

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

`:CocCommand maven.project.generatedResources` lists the generated files of a
project and opens the one you pick. See `:help coc-maven-generated`.

### Pom editing and new projects

`maven.completion.gavEnabled` set to `false` turns off only the Maven Central
lookups; the candidates from the Java language server index and the local
repository stay. `maven.dependency.enableConflictDiagnostics` set to `false`
also clears the reported conflicts.

After a project or module is created, `maven.projectOpenBehavior` `"Open"`
opens its folder, `"Cancel"` does nothing, and `"Interactive"` (and any other
value) asks.

## Files

The extension writes:

- the files Maven generates for a project (effective pom, dependency tree,
  profiles, plugin descriptions), in `maven.outputDirectory`, by default in
  the coc storage folder of the extension; see Generated files above;
- the command history of each pom, in the coc storage folder of the
  extension;
- the archetype catalog, when you update it, in the coc storage folder of the
  extension (`:help coc-maven-archetype`);
- a copy of the artifact index for the artifact searcher, in the coc storage
  folder of the extension.

It edits your poms only through the dependency, module and project commands.

## Troubleshooting

- **"Maven not found in PATH"**: install Maven or a wrapper, or set
  `maven.executable.path`; see Configuration for the lookup order.
- **Completion, hover and definition do nothing in a pom**: check
  `:set filetype?` in the pom buffer. It must be `xml`; see the filetype
  setup above.
- **No groupId or artifactId candidates**: Maven Central needs network access
  and `maven.completion.gavEnabled` on, and the Java language server index needs
  `coc-java` in standard mode.
- **The explorer is empty**: no `pom.xml` was found; check
  `maven.excludedFolders` and `maven.pomfile.globPattern`.
- **Maven fails**: open its output with `:CocCommand workspace.showOutput maven`.
  The channel also shows the local repository and the `JAVA_HOME` set in
  `maven.terminal.customEnv`.

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
