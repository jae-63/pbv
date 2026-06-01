import * as fs from 'fs';
import * as vscode from 'vscode';
import { CachePad } from './cachepad';
import { ModeStatusBar } from './statusbar';
import { IpcServer } from './server';
import { OutboundMessage } from './types';
import { ClaudeClient } from './claudeClient';
import { showCommandsPanel } from './commandsPanel';

function extensionMtime(): string {
    try {
        const t = fs.statSync(__filename).mtime;
        return t.toISOString().slice(0, 16).replace('T', ' ');
    } catch { return 'unknown'; }
}

export function activate(context: vscode.ExtensionContext): void {
    vscode.window.setStatusBarMessage(`PBV loaded (${extensionMtime()})`, 6000);
    const config      = vscode.workspace.getConfiguration('pbv');
    const port        = config.get<number>('port', 7890);
    const maxItems    = config.get<number>('maxCacheItems', 20);
    const ollamaModel = config.get<string>('ollamaModel', 'qwen2.5:3b');
    const ollamaUrl   = config.get<string>('ollamaUrl', 'http://localhost:11434');

    const statusBar = new ModeStatusBar();

    // Cache pad — broadcast fn will be wired to the server once it's created.
    let broadcastFn: (msg: object) => void = () => {};
    const cache = new CachePad(
        maxItems,
        (msg) => broadcastFn(msg),
        (items) => context.workspaceState.update('pbv.cacheItems', items),
    );

    // IPC server
    const claude = new ClaudeClient(ollamaModel, ollamaUrl);
    const server = new IpcServer(port, cache, statusBar, context, claude);
    broadcastFn  = (msg) => server.broadcast(msg as OutboundMessage);

    // Register cache pad tree view
    const treeView = vscode.window.createTreeView('pbv.cachePad', {
        treeDataProvider: cache,
        showCollapseAll:  false,
    });

    // Register commands (also callable from command palette for testing)
    const cmds = [
        vscode.commands.registerCommand('pbv.refreshCachePad', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) cache.absorbDocument(editor.document);
        }),
        vscode.commands.registerCommand('pbv.cacheCurrentWord', () => {
            cache.cacheWordAtCursor();
        }),
        vscode.commands.registerCommand('pbv.clearCachePad', () => {
            cache.clear();
        }),
        vscode.commands.registerCommand('pbv.showCommands', () => {
            showCommandsPanel(context);
        }),
    ];

    // Capture identifiers from edits as they happen (imports get priority slot 1).
    const editListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document) {
            cache.absorbEdit(event);
        }
    });

    // File-switch no longer triggers a full document scan — that was the main
    // source of noise (prose words from docstrings, identifiers from unrelated files).
    // Explicit 'refresh cache pad' still does a full scan on demand.
    const editorListener = vscode.window.onDidChangeActiveTextEditor(_editor => {});

    // Restore cache from previous session (workspace-scoped).
    const persisted = context.workspaceState.get<string[]>('pbv.cacheItems', []);
    if (persisted.length > 0) cache.sync(persisted);

    context.subscriptions.push(statusBar, treeView, server, editListener, editorListener, ...cmds);
}

export function deactivate(): void {}
