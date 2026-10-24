// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Dependency } from "./Dependency";

export interface IDependencyTree {
    text: string;
    conflictText: string;
    treeNodes: Dependency[];
    conflictNodes: Dependency[];
}
