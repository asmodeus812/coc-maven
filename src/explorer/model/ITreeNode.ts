// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export interface ITreeNode {
    children: ITreeNode[];
    parent?: ITreeNode;
    root?: ITreeNode;

    addChild(node: ITreeNode): void;
}
