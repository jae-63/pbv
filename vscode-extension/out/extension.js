"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const cachepad_1 = require("./cachepad");
const statusbar_1 = require("./statusbar");
const server_1 = require("./server");
function activate(context) {
    const config = vscode.workspace.getConfiguration('voiceCoder');
    const port = config.get('port', 7890);
    const maxItems = config.get('maxCacheItems', 20);
    const statusBar = new statusbar_1.ModeStatusBar();
    // Cache pad — broadcast fn will be wired to the server once it's created.
    let broadcastFn = () => { };
    const cache = new cachepad_1.CachePad(maxItems, (msg) => broadcastFn(msg));
    // IPC server
    const server = new server_1.IpcServer(port, cache, statusBar);
    broadcastFn = (msg) => server.broadcast(msg);
    // Register cache pad tree view
    const treeView = vscode.window.createTreeView('voiceCoder.cachePad', {
        treeDataProvider: cache,
        showCollapseAll: false,
    });
    // Register commands (also callable from command palette for testing)
    const cmds = [
        vscode.commands.registerCommand('voiceCoder.refreshCachePad', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor)
                cache.absorbDocument(editor.document);
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
        if (editor)
            cache.absorbDocument(editor.document);
    });
    // Initial scan of the already-open file (if any)
    if (vscode.window.activeTextEditor) {
        cache.absorbDocument(vscode.window.activeTextEditor.document);
    }
    context.subscriptions.push(statusBar, treeView, server, editListener, editorListener, ...cmds);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map