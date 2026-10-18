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

Set these keys in `coc-settings.json` (`:CocConfig` opens it).

### Maven executable

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.executable.path` | string | `""` | Path of the Maven executable, for example `/usr/local/bin/mvn`. A leading `~` is expanded. |
| `maven.executable.preferMavenWrapper` | boolean | `true` | Use the Maven wrapper of the project when it has one. |
| `maven.executable.options` | string or array of string | `""` | Options added to every Maven command, for example `-o -s ./settings.xml`. |
| `maven.settingsFile` | string or null | `null` | The Maven `settings.xml`, passed with `-s` and read for `<localRepository>`. A change reloads the local repository location. |

The extension takes the first Maven it finds: `maven.executable.path` when it
is not empty; the wrapper, when `maven.executable.preferMavenWrapper` is on,
`mvnw` (`mvnw.cmd` on Windows) in the folder of the pom or the nearest parent
folder up to the workspace folder; `mvn` from `$PATH`. When it finds none, it
asks for the path and writes the answer to `maven.executable.path` in your
user `coc-settings.json`. A relative path, or one inside a workspace folder,
needs a confirmation once per session (`:help coc-maven-executable`).

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

### Terminal

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.terminal.customEnv` | array of objects | `[]` | Environment variables for Maven, in the terminal and in background runs. A change closes the Maven terminals. |
| `maven.terminal.favorites` | array of objects | two entries, below | Favorite Maven command lines, listed in the explorer and by the favorites command. |

Each `customEnv` object has a non-empty string `environmentVariable` and a
string `value`. A name that is not made of letters, digits and underscores, or
that starts with a digit, is skipped and logged in the output channel `maven`.
The terminal sets the variables in the syntax of the shell in `$SHELL`:
PowerShell, `cmd.exe`, `fish` and POSIX shells, including WSL, where paths are
converted with `wslpath`.

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

### Explorer and project discovery

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.view` | `"flat"` or `"hierarchical"` | `"hierarchical"` | Lists all projects on one level, or nests modules below the project that declares them. |
| `maven.explorer.projectName` | string | `"${project.name}"` | The label of a project in the explorer. |
| `maven.excludedFolders` | array of string | `["**/.*", "**/node_modules", "**/target", "**/bin", "**/archetype-resources"]` | Glob patterns of folders that the search for poms skips. |
| `maven.pomfile.globPattern` | string | `"**/pom.xml"` | The glob that finds the poms of the workspace and that the file watcher observes. |
| `maven.pomfile.autoUpdateEffectivePOM` | boolean | `true` | Recompute the effective pom of a project in the background after its `pom.xml` changes on disk. |
| `maven.pomfile.prefetchEffectivePom` | boolean | `true` | Compute the effective pom of every project in the background when the projects are loaded, so hover and the explorer have it ready. Can be turned off per project. |

`maven.explorer.projectName` takes one of `${project.name}`,
`${project.artifactId}`, `${project.artifactId}-${project.version}`,
`${project.groupId}.${project.artifactId}` and
`${project.groupId}.${project.artifactId}-${project.version}`. A project
without a `<name>` shows its artifactId for `${project.name}`.

`maven.pomfile.globPattern` does not decide which buffers get the pom
features: those attach to the filetype `xml` with the pattern
`**/{pom.xml,*.pom}`.

The explorer refreshes when `maven.view`, `maven.pomfile.globPattern`,
`maven.explorer.projectName` or `maven.terminal.favorites` changes.

The commands that switch the explorer layout write to your user
`coc-settings.json`. The command that adds a favorite writes to
`.vim/coc-settings.json` of the workspace folder, which it creates when needed;
that list replaces the user list for the folder.

### Pom editing

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.completion.gavEnabled` | boolean | `true` | Look up `groupId`, `artifactId` and `version` candidates on Maven Central. `false` turns off only the Central lookups; the candidates from the Java language server index and the local repository stay. |
| `maven.dependency.enableConflictDiagnostics` | boolean | `true` | Report dependency conflicts as warnings. `false` also clears the reported ones. |

### New projects

| Key | Type | Default | Effect |
|---|---|---|---|
| `maven.projectOpenBehavior` | `"Interactive"`, `"Open"` or `"Cancel"` | `"Interactive"` | After a project or module is created: `"Open"` opens its folder, `"Cancel"` does nothing, `"Interactive"` (and any other value) asks. |

## Files

The extension writes:

- the command history of each pom, in the temporary folder of the system;
- cached Maven results (effective pom, profiles, dependency tree, plugin
  descriptions), in the coc storage folder of the extension;
- the archetype catalog, when you update it (`:help coc-maven-archetype`);
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
