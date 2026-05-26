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
exports.IpcServer = void 0;
const net = __importStar(require("net"));
const vscode = __importStar(require("vscode"));
const navigator_1 = require("./navigator");
// Map action names from core.yaml to built-in VSCode command IDs.
const VSCODE_COMMANDS = {
    undo: 'undo',
    redo: 'redo',
    deleteToEndOfLine: 'deleteAllRight',
    deleteLine: 'editor.action.deleteLines',
    duplicateLine: 'editor.action.copyLinesDownAction',
    selectAll: 'editor.action.selectAll',
    cut: 'editor.action.clipboardCutAction',
    copy: 'editor.action.clipboardCopyAction',
    paste: 'editor.action.clipboardPasteAction',
    save: 'workbench.action.files.save',
    formatDocument: 'editor.action.formatDocument',
    toggleLineComment: 'editor.action.commentLine',
    find: 'actions.find',
    replace: 'editor.action.startFindReplaceAction',
    cursorLeft: 'cursorLeft',
    cursorRight: 'cursorRight',
    cursorHome: 'cursorHome',
    cursorEnd: 'cursorEnd',
    cursorTop: 'cursorTop',
    cursorBottom: 'cursorBottom',
    pageUp: 'scrollPageUp',
    pageDown: 'scrollPageDown',
};
class IpcServer {
    constructor(port, cache, statusBar) {
        this.cache = cache;
        this.statusBar = statusBar;
        this.sockets = new Set();
        this.port = port;
        this.server = net.createServer(socket => this.onConnection(socket));
        this.server.listen(port, '127.0.0.1', () => {
            vscode.window.setStatusBarMessage(`Voice Coder: listening on :${port}`, 3000);
        });
        this.server.on('error', err => {
            vscode.window.showErrorMessage(`Voice Coder IPC error: ${err.message}`);
        });
    }
    // Push a message to all connected clients (used for cache-update events).
    broadcast(msg) {
        const line = JSON.stringify(msg) + '\n';
        for (const s of this.sockets) {
            if (!s.destroyed)
                s.write(line);
        }
    }
    dispose() {
        for (const s of this.sockets)
            s.destroy();
        this.server.close();
    }
    // vscode.Disposable
    [Symbol.dispose]() { this.dispose(); }
    onConnection(socket) {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
        let buffer = '';
        socket.on('data', data => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                this.handle(trimmed, socket);
            }
        });
    }
    async handle(raw, socket) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            this.reply(socket, { ok: false, error: 'malformed JSON' });
            return;
        }
        try {
            await this.dispatch(msg, socket);
            this.reply(socket, { ok: true });
        }
        catch (err) {
            this.reply(socket, { ok: false, error: String(err) });
        }
    }
    reply(socket, msg) {
        if (!socket.destroyed)
            socket.write(JSON.stringify(msg) + '\n');
    }
    async dispatch(msg, _socket) {
        const editor = vscode.window.activeTextEditor;
        switch (msg.cmd) {
            // --- Text insertion ---
            case 'insertText': {
                if (!editor)
                    return;
                const raw = msg.text;
                const cursor = raw.indexOf('{CURSOR}');
                const text = raw.replace('{CURSOR}', '');
                await editor.edit(eb => eb.insert(editor.selection.active, text));
                if (cursor !== -1) {
                    // Place cursor at the {CURSOR} marker position
                    const inserted = editor.selection.active;
                    // The marker was at `cursor` chars from the start of the inserted string.
                    // Walk back from the end of the insertion to find it.
                    const endOffset = editor.document.offsetAt(inserted);
                    const markOffset = endOffset - (text.length - cursor);
                    const markPos = editor.document.positionAt(markOffset);
                    editor.selection = new vscode.Selection(markPos, markPos);
                }
                break;
            }
            // --- Navigation ---
            case 'gotoLine':
                await (0, navigator_1.gotoLine)(msg.line);
                break;
            case 'gotoWordOnLine':
                await (0, navigator_1.gotoWordOnLine)(msg.word, msg.line);
                break;
            case 'selectToken':
                await (0, navigator_1.selectToken)(msg.token);
                break;
            case 'cursorUp':
                for (let i = 0; i < (msg.n ?? 1); i++)
                    await vscode.commands.executeCommand('cursorUp');
                break;
            case 'cursorDown':
                for (let i = 0; i < (msg.n ?? 1); i++)
                    await vscode.commands.executeCommand('cursorDown');
                break;
            // --- Cache pad ---
            case 'insertCacheItem': {
                const sym = this.cache.insertAt(msg.index);
                if (sym && editor) {
                    await editor.edit(eb => eb.insert(editor.selection.active, sym));
                }
                break;
            }
            case 'cacheCurrentWord':
                this.cache.cacheWordAtCursor();
                break;
            case 'refreshCachePad':
                if (editor)
                    this.cache.absorbDocument(editor.document);
                break;
            case 'evictCacheItem':
                this.cache.evict(msg.index);
                break;
            case 'clearCachePad':
                this.cache.clear();
                break;
            // --- Mode ---
            case 'setMode':
                this.statusBar.setMode(msg.mode);
                break;
            // --- Undo grouping ---
            case 'startUndoGroup':
                // VSCode doesn't expose a direct undo-group API; a no-op stop
                // inserted before and after a group achieves the same result.
                if (editor)
                    await editor.edit(_eb => { }, { undoStopBefore: true, undoStopAfter: false });
                break;
            case 'endUndoGroup':
                if (editor)
                    await editor.edit(_eb => { }, { undoStopBefore: false, undoStopAfter: true });
                break;
            // --- Char / word deletion ---
            case 'deleteChars':
                for (let i = 0; i < msg.n; i++)
                    await vscode.commands.executeCommand('deleteLeft');
                break;
            case 'selectChars': {
                if (!editor)
                    break;
                const start = editor.selection.active;
                const endOff = editor.document.offsetAt(start) + msg.n;
                const end = editor.document.positionAt(Math.min(endOff, editor.document.getText().length));
                editor.selection = new vscode.Selection(start, end);
                break;
            }
            case 'deleteWords':
                for (let i = 0; i < msg.n; i++)
                    await vscode.commands.executeCommand('deleteWordLeft');
                break;
            // --- Undo / redo ---
            case 'undo':
                await vscode.commands.executeCommand('undo');
                break;
            case 'redo':
                await vscode.commands.executeCommand('redo');
                break;
            // --- Everything else maps 1:1 to a VSCode command ---
            default: {
                const vcCmd = VSCODE_COMMANDS[msg.cmd];
                if (vcCmd)
                    await vscode.commands.executeCommand(vcCmd);
                break;
            }
        }
    }
}
exports.IpcServer = IpcServer;
//# sourceMappingURL=server.js.map