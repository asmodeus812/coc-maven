// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import * as fs from "fs";
import * as _ from "lodash";
import * as path from "path";
import { MavenProjectManager } from "../../project/MavenProjectManager";
import { Settings } from "../../Settings";
import { rawProfileList } from "../../utils/mavenUtils";
import { Utils } from "../../utils/Utils";
import { EffectivePomProvider } from "../EffectivePomProvider";
import { MavenExplorerProvider } from "../MavenExplorerProvider";
import { DependenciesMenu } from "./DependenciesMenu";
import { Dependency } from "./Dependency";
import { FavoritesMenu } from "./FavoritesMenu";
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
    public _fullDependencyText: string | undefined;
    public _conflictNodes: Dependency[] | undefined;
    public dependencyNodes: Dependency[] | undefined;
    private readonly ePomProvider: EffectivePomProvider;
    private _ePom: any;
    private _pom: any;
    private readonly properties: Map<string, string> = new Map();
    public profiles: MavenProfile[] | undefined;

    constructor(pomPath: string) {
        this.pomPath = pomPath;
        this.ePomProvider = new EffectivePomProvider(pomPath);
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

    public get fullText(): string | undefined {
        return this._fullDependencyText;
    }

    public set fullText(text: string) {
        this._fullDependencyText = text;
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

    public get plugins(): MavenPlugin[] {
        let plugins: any[] | undefined;
        if (_.has(this._ePom, "projects.project")) {
            // multi-module project
            const project: any = this._ePom.projects.project.find((elem: any) => this.name === _.get(elem, "artifactId[0]"));
            if (project) {
                plugins = _.get(project, "build[0].plugins[0].plugin");
            }
        } else {
            // single-project
            plugins = _.get(this._ePom, "project.build[0].plugins[0].plugin");
        }
        return this._convertXmlPlugin(plugins);
    }

    public get dependencies(): Dependency[] {
        let deps: any[] = [];
        if (_.has(this._ePom, "projects.project")) {
            // multi-module project
            const project: any = this._ePom.projects.project.find((elem: any) => this.name === _.get(elem, "artifactId[0]"));
            if (project) {
                deps = _.get(project, "build[0].plugins[0].plugin");
            }
        } else {
            // single-project
            deps = _.get(this._ePom, "project.dependencies[0].dependency");
        }
        return this._convertXmlDependency(deps);
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

    public get conflictNodes(): Dependency[] {
        return this._conflictNodes ?? [];
    }

    public set conflictNodes(nodes: Dependency[]) {
        this._conflictNodes = nodes;
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

    public async refreshEffectivePom(): Promise<void> {
        await this.ePomProvider.calculateEffectivePom();
    }

    public async getEffectivePom(options?: { cacheOnly?: boolean }): Promise<IEffectivePom> {
        try {
            let result: IEffectivePom = await this.ePomProvider.getEffectivePom(options);
            this._ePom = result?.ePom;
            return result;
        } catch (error) {
            throw new Error(`Failed to calculate Effective POM - ${(error as Error).message})`);
        }
    }

    public async refresh(): Promise<void> {
        await this._refreshPom();
    }

    public async parsePom(): Promise<void> {
        try {
            this._pom = await Utils.parseXmlFile(this.pomPath);
            this.updateProperties();
        } catch (error) {
            console.warn((error as Error).message);
            this._pom = undefined;
        }
    }

    public getDependencyVersion(gid: string, aid: string): string | undefined {
        // from effective POM
        const deps: Dependency[] | undefined = this.dependencies;
        const targetDep: any = deps?.find((elem) => elem.groupId === gid && elem.artifactId === aid);
        if (targetDep?.version?.[0] !== undefined) {
            return targetDep.version[0];
        }
        // from dependency plugin
        const targetNode = this.dependencyNodes?.find((n) => n.groupId === gid && n.artifactId === aid);
        if (targetNode?.version) {
            return targetNode.version;
        }
        return undefined;
    }

    private async _refreshPom(): Promise<void> {
        await this.parsePom();
        await this.getEffectivePom();
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
    public getProperties() {
        const propertiesNode = _.get(this._ePom, "project.properties[0]");
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
