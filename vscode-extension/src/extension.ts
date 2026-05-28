import * as vscode from 'vscode';
import { CachePad } from './cachepad';
import { ModeStatusBar } from './statusbar';
import { IpcServer } from './server';
import { OutboundMessage } from './types';
import { ClaudeClient } from './claudeClient';

export function activate(context: vscode.ExtensionContext): void {
    const config      = vscode.workspace.getConfiguration('voiceCoder');
    const port        = config.get<number>('port', 7890);
    const maxItems    = config.get<number>('maxCacheItems', 20);
    const ollamaModel = config.get<string>('ollamaModel', 'phi4-mini:latest');
    const ollamaUrl   = config.get<string>('ollamaUrl', 'http://localhost:11434');

    const statusBar = new ModeStatusBar();

    // Cache pad — broadcast fn will be wired to the server once it's created.
    let broadcastFn: (msg: object) => void = () => {};
    const cache = new CachePad(maxItems, (msg) => broadcastFn(msg));

    // IPC server
    const claude = new ClaudeClient(ollamaModel, ollamaUrl);
    const server = new IpcServer(port, cache, statusBar, claude);
    broadcastFn  = (msg) => server.broadcast(msg as OutboundMessage);

    // Register cache pad tree view
    const treeView = vscode.window.createTreeView('voiceCoder.cachePad', {
        treeDataProvider: cache,
        showCollapseAll:  false,
    });

    // Register commands (also callable from command palette for testing)
    const cmds = [
        vscode.commands.registerCommand('voiceCoder.refreshCachePad', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) cache.absorbDocument(editor.document);
        }),
        vscode.commands.registerCommand('voiceCoder.cacheCurrentWord', () => {
            cache.cacheWordAtCursor();
        }),
        vscode.commands.registerCommand('voiceCoder.clearCachePad', () => {
            cache.clear();
        }),
    ];

    // Auto-populate cache on document edits
    const editListener = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document) {
            cache.absorbEdit(event);
        }
    });

    // Rescan on file switch
    const editorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) cache.absorbDocument(editor.document);
    });

    // Initial scan of the already-open file (if any)
    if (vscode.window.activeTextEditor) {
        cache.absorbDocument(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(statusBar, treeView, server, editListener, editorListener, ...cmds);
}

export function deactivate(): void {}
