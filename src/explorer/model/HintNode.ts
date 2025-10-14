// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as coc from "coc.nvim";
import { ITreeItem } from "./ITreeItem";

export class HintNode implements ITreeItem {
    private readonly _msg: string;

    constructor(msg: string) {
        this._msg = msg;
    }

    public getContextValue(): string {
        return "maven:hint";
    }

    public getTreeItem(): coc.TreeItem | coc.Thenable<coc.TreeItem> {
        const treeItem: coc.TreeItem = new coc.TreeItem("");
        treeItem.description = this._msg;
        return treeItem;
    }
}
