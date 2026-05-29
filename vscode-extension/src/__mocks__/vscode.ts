// Minimal VSCode API stub — only what the source files reference at module level.
// Tests that exercise pure helpers don't need this, but it satisfies the import.
export const window = {
    activeTextEditor: undefined,
    setStatusBarMessage: () => ({ dispose: () => {} }),
    showWarningMessage: () => {},
    showErrorMessage: () => {},
};
export const workspace = {
    getConfiguration: () => ({ get: (_k: string, def: unknown) => def }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
};
export const commands = { executeCommand: async () => {} };
export const env = { openExternal: async () => {} };
export class Uri {
    static file(p: string) { return { fsPath: p }; }
}
export class Position {
    constructor(public line: number, public character: number) {}
}
export class Selection {
    constructor(public anchor: Position, public active: Position) {}
}
export class Range {
    constructor(public start: Position, public end: Position) {}
}
export enum TextEditorRevealType { InCenter = 1 }
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const EventEmitter = class { fire() {} event = () => {} };
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export class TreeItem { constructor(public label: string) {} }
