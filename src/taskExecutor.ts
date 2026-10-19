// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Disposable } from "coc.nvim";

// every task runs maven in the background, this bounds how many of them run at the same time
const MAX_RUNNING_TASKS = 4;

/**
 * Runs tasks in the background, at most one per key at a time. A new task for a key replaces the one still waiting for
 * it, only the latest state of a key is worth running.
 */
class TaskExecutor implements Disposable {
    private readonly _waiting: Map<string, CallableFunction> = new Map();

    private readonly _running: Set<string> = new Set();

    public execute(key: string, task: CallableFunction): void {
        this._waiting.set(key, task);
        this._pickAndRun();
    }

    public dispose(): void {
        // do nothing
    }

    private _pickAndRun(): void {
        for (const [key, task] of this._waiting) {
            if (this._running.size >= MAX_RUNNING_TASKS) {
                break;
            }
            if (!this._running.has(key)) {
                this._waiting.delete(key);
                this._running.add(key);
                this._run(task).finally(() => {
                    this._running.delete(key);
                    this._pickAndRun();
                });
            }
        }
    }

    private async _run(task: CallableFunction): Promise<void> {
        try {
            await task();
        } catch (error) {
            console.warn((error as Error).message);
        }
    }
}

export const taskExecutor: TaskExecutor = new TaskExecutor();
