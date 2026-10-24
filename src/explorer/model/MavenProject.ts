// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import * as fs from "fs";
import * as _ from "lodash";
import * as path from "path";
import { MavenProjectManager } from "../../project/MavenProjectManager";
import { rawDependencyTree, rawEffectivePom, rawProfileList } from "../../utils/mavenUtils";
import { parseDependencyTree } from "../../utils/parseDependencyTree";
import { parseEffectivePom } from "../../utils/parseEffectivePom";
import { Settings } from "../../Settings";
import { Utils } from "../../utils/Utils";
import { MavenExplorerProvider } from "../MavenExplorerProvider";
import { MavenOutputProvider } from "../MavenOutputProvider";
import { DependenciesMenu } from "./DependenciesMenu";
import { Dependency } from "./Dependency";
import { FavoritesMenu } from "./FavoritesMenu";
import { IDependencyTree } from "./IDependencyTree";
import { IEffectivePom } from "./IEffectivePom";
import { ITreeItem } from "./ITreeItem";
import { LifecycleMenu } from "./LifecycleMenu";
import { MavenPlugin } from "./MavenPlugin";
import { MavenProfile } from "./MavenProfile";
import { PluginsMenu } from "./PluginsMenu";
import { ProfilesMenu } from "./ProfilesMenu";

export class MavenProject implements ITreeItem {
    public parent?: MavenProject; // assigned if it's specified as one of parent project's modules
    public pomPath: string;
    private readonly effectivePomProvider: MavenOutputProvider<IEffectivePom>;
    private readonly dependencyTreeProvider: MavenOutputProvider<IDependencyTree>;
    private _pom: any;
    private readonly properties: Map<string, string> = new Map();
    public profiles: MavenProfile[] | undefined;

    constructor(pomPath: string) {
        this.pomPath = pomPath;
        this.effectivePomProvider = new MavenOutputProvider(pomPath, "epom", "Effective POM", rawEffectivePom, parseEffectivePom, () =>
            this.sourcePomPaths()
        );
        this.dependencyTreeProvider = new MavenOutputProvider(
            pomPath,
            "deps.txt",
            "Dependency Tree",
            rawDependencyTree,
            parseDependencyTree,
            () => this.sourcePomPaths()
        );
    }

    // the pom and the parent poms on disk it inherits from, a change of any of them changes the outputs of this project
    private sourcePomPaths(): string[] {
        const paths: string[] = [this.pomPath];
        let parentPomPath: string | undefined = this.parentPomPath;
        while (parentPomPath !== undefined && fs.existsSync(parentPomPath) && !paths.includes(path.resolve(parentPomPath))) {
            paths.push(path.resolve(parentPomPath));
            parentPomPath = MavenProjectManager.get(parentPomPath)?.parentPomPath;
        }
        return paths;
    }

    public get name(): string {
        // use <name> if provided, fallback to <artifactId>
        if (this._pom?.project?.name?.[0] !== undefined) {
            const rawName: string = this._pom.project.name[0];
            return this.fillProperties(rawName);
        } else {
            return this._pom?.project?.artifactId?.[0];
        }
    }

    public get groupId(): string {
        return this._pom?.project?.groupId?.[0] ?? this._pom?.project?.parent?.[0]?.groupId?.[0] ?? this.parent?.groupId;
    }

    public get artifactId(): string {
        return this._pom?.project?.artifactId?.[0];
    }

    public get version(): string {
        return this._pom?.project?.version?.[0] ?? this._pom?.project?.parent?.[0]?.version?.[0] ?? this.parent?.version;
    }

    public get id(): string {
        return `${this.groupId}:${this.artifactId}`;
    }

    public get packaging(): string {
        return _.get(this._pom, "project.packaging[0]");
    }

    public get moduleNames(): string[] {
        const moduleNames: string[] | undefined = _.get(this._pom, "project.modules[0].module");
        return moduleNames ?? [];
    }

    public async getPlugins(): Promise<MavenPlugin[]> {
        return this._convertXmlPlugin(_.get(await this.getEffectiveProject(), "build[0].plugins[0].plugin"));
    }

    // the node of this project in its effective pom, a multi-module effective pom lists every module by its artifactId
    private async getEffectiveProject(): Promise<any> {
        const ePom: any = (await this.getEffectivePom())?.ePom;
        if (_.has(ePom, "projects.project")) {
            return ePom.projects.project.find((elem: any) => this.artifactId === _.get(elem, "artifactId[0]"));
        } else {
            return _.get(ePom, "project");
        }
    }

    /**
     * @return list of absolute path of modules pom.xml.
     */
    public get modules(): string[] {
        return this.moduleNames.map((moduleName) => {
            const relative: string = path.join(path.dirname(this.pomPath), moduleName);
            if (fs.existsSync(relative) && fs.statSync(relative).isFile()) {
                return relative;
            } else {
                return path.join(relative, "pom.xml");
            }
        });
    }

    /**
     * Absolute path of parent POM, inferred from `parent.relativePath`.
     */
    public get parentPomPath(): string | undefined {
        const parentNode = this._pom?.project?.parent?.[0];
        if (parentNode) {
            const relativePath: string = parentNode.relativePath?.[0];
            if (relativePath === undefined) {
                // default
                return path.join(path.dirname(this.pomPath), "..", "pom.xml");
            } else if (relativePath === "") {
                // disabled explicitly
                return undefined;
            } else {
                return path.join(path.dirname(this.pomPath), relativePath);
            }
        }
        return undefined;
    }

    public async getTreeItem(): Promise<coc.TreeItem> {
        await this.parsePom();
        const label = this.artifactId ? Settings.getExploreProjectName(this) : "Unknown";
        const treeItem: coc.TreeItem = new coc.TreeItem(label);
        treeItem.collapsibleState = coc.TreeItemCollapsibleState.Collapsed;
        treeItem.description = this.id;
        treeItem.command = {
            title: "Goto effective pom",
            command: "maven.explorer.goToEffective",
            arguments: [this]
        } as coc.Command;
        return treeItem;
    }

    public getContextValue(): string {
        return `maven:${this.pomPath}`;
    }

    public getChildren(): ITreeItem[] {
        const ret: ITreeItem[] = [];
        ret.push(new LifecycleMenu(this));
        ret.push(new PluginsMenu(this));
        ret.push(new DependenciesMenu(this));
        ret.push(new FavoritesMenu(this));
        ret.push(new ProfilesMenu(this));
        if (this.moduleNames.length > 0 && Settings.viewType() === "hierarchical") {
            const projects: MavenProject[] = this.modules.map((m) => MavenProjectManager.get(m)).filter(Boolean) as MavenProject[];
            ret.push(...projects);
        }
        return ret;
    }

    public async getEffectivePom(): Promise<IEffectivePom | undefined> {
        return this.effectivePomProvider.get();
    }

    public async getDependencyTree(): Promise<IDependencyTree | undefined> {
        return this.dependencyTreeProvider.get();
    }

    // the pom changed on disk, the next read of the effective pom loads it again
    public invalidateEffectivePom(): void {
        this.effectivePomProvider.invalidate();
    }

    // the pom changed on disk, the next read of the dependency tree loads it again
    public invalidateDependencyTree(): void {
        this.dependencyTreeProvider.invalidate();
    }

    public async refresh(): Promise<void> {
        await this._refreshPom();
    }

    public async parsePom(): Promise<void> {
        try {
            this._pom = await Utils.parseXmlFile(this.pomPath);
            this.updateProperties();
        } catch (error) {
            // a pom that does not parse (being edited, saved incomplete) keeps the last valid one, its identity finds
            // the project in a multi-module effective pom and the hover keeps the last valid versions
            console.warn((error as Error).message);
        }
    }

    public async getDependencyVersion(gid: string, aid: string): Promise<string | undefined> {
        // a dependency of the project, or one its dependency management sets the version of
        const project: any = await this.getEffectiveProject();
        const deps: Dependency[] = [
            ...this._convertXmlDependency(_.get(project, "dependencies[0].dependency")),
            ...this._convertXmlDependency(_.get(project, "dependencyManagement[0].dependencies[0].dependency"))
        ];
        return deps.find((elem) => elem.groupId === gid && elem.artifactId === aid && elem.version)?.version;
    }

    private async _refreshPom(): Promise<void> {
        await this.parsePom();
        MavenExplorerProvider.getInstance().refresh(this);
    }

    private _convertXmlDependency(deps: any[] | undefined): Dependency[] {
        if (deps && deps.length > 0) {
            return deps.map(
                (p) =>
                    new Dependency(
                        _.get(p, "groupId[0]"),
                        _.get(p, "artifactId[0]"),
                        _.get(p, "version[0]"),
                        _.get(p, "scope[0]"),
                        this.pomPath
                    )
            );
        }
        return [];
    }

    private _convertXmlPlugin(plugins: any[] | undefined): MavenPlugin[] {
        if (plugins && plugins.length > 0) {
            return plugins.map(
                (p) =>
                    new MavenPlugin(
                        this,
                        _.has(p, "groupId[0]") ? _.get(p, "groupId[0]") : "org.apache.maven.plugins",
                        _.get(p, "artifactId[0]"),
                        _.get(p, "version[0]")
                    )
            );
        }
        return [];
    }

    private updateProperties(): void {
        if (this?._pom?.project?.properties?.[0] !== undefined) {
            for (const [key, value] of Object.entries<any>(this._pom.project.properties[0])) {
                this.properties.set(key, value[0]);
            }
        }
    }

    public fillProperties(rawName: string): string {
        const stringTemplatePattern = /\$\{.*?\}/g;
        const matches: RegExpMatchArray | null = rawName.match(stringTemplatePattern);
        if (matches === null) {
            return rawName;
        }

        let name: string = rawName;
        for (const placeholder of matches) {
            const key: string = placeholder.slice(2, placeholder.length - 1);
            const value: string | undefined = this.getProperty(key);
            if (value !== undefined) {
                name = name.replace(placeholder, value);
            }
        }
        return name;
    }

    /**
     * Get value of a property, including those inherited from parents
     * @param key property name
     * @returns value of property
     */
    public getProperty(key: string): string | undefined {
        if (this.properties.has(key)) {
            return this.properties.get(key);
        }

        let cur: MavenProject | undefined = (this.parentPomPath ? MavenProjectManager.get(this.parentPomPath) : undefined) ?? this.parent;
        while (cur !== undefined) {
            if (cur.properties.has(key)) {
                return cur.properties.get(key);
            }
            cur = (cur.parentPomPath ? MavenProjectManager.get(cur.parentPomPath) : undefined) ?? cur.parent;
        }
        return undefined;
    }

    /**
     * get properties from effective pom
     */
    public async getProperties(): Promise<string[] | undefined> {
        const propertiesNode = _.get(await this.getEffectiveProject(), "properties[0]");
        if (typeof propertiesNode === "object") {
            return Object.keys(propertiesNode);
        } else {
            return undefined;
        }
    }

    public async refreshProfiles() {
        try {
            const output = await rawProfileList(this.pomPath);
            if (output) {
                const profiles = Utils.parseProfilesOutput(this, output);
                this.profiles = profiles;
            }
        } catch (error) {
            coc.window.showErrorMessage(`Unable to refresh profiles ${(error as Error).message}`);
            this.profiles = undefined;
            throw error;
        }
    }
}
