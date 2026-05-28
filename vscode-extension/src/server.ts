import * as net from 'net';
import * as vscode from 'vscode';
import { InboundMessage, OutboundMessage } from './types';
import { CachePad } from './cachepad';
import { ModeStatusBar } from './statusbar';
import { gotoLine, gotoWordOnLine, selectToken } from './navigator';
import { ClaudeClient, EditorSnapshot } from './claudeClient';

// Map action names from core.yaml to built-in VSCode command IDs.
const VSCODE_COMMANDS: Record<string, string> = {
    undo:               'undo',
    redo:               'redo',
    deleteToEndOfLine:  'deleteAllRight',
    deleteLine:         'editor.action.deleteLines',
    duplicateLine:      'editor.action.copyLinesDownAction',
    selectAll:          'editor.action.selectAll',
    cut:                'editor.action.clipboardCutAction',
    copy:               'editor.action.clipboardCopyAction',
    paste:              'editor.action.clipboardPasteAction',
    save:               'workbench.action.files.save',
    formatDocument:     'editor.action.formatDocument',
    toggleLineComment:  'editor.action.commentLine',
    find:               'actions.find',
    replace:            'editor.action.startFindReplaceAction',
    cursorLeft:         'cursorLeft',
    cursorRight:        'cursorRight',
    cursorHome:         'cursorHome',
    cursorEnd:          'cursorEnd',
    cursorTop:          'cursorTop',
    cursorBottom:       'cursorBottom',
    pageUp:             'scrollPageUp',
    pageDown:           'scrollPageDown',
};

interface Mark {
    uri:    string;
    text:   string;
    cursor: vscode.Position;
}

export class IpcServer {
    private server: net.Server;
    private sockets = new Set<net.Socket>();
    private port: number;
    private mark: Mark | undefined;

    constructor(
        port: number,
        private cache: CachePad,
        private statusBar: ModeStatusBar,
        private claude?: ClaudeClient,
    ) {
        this.port   = port;
        this.server = net.createServer(socket => this.onConnection(socket));
        this.server.listen(port, '127.0.0.1', () => {
            vscode.window.setStatusBarMessage(`Voice Coder: listening on :${port}`, 3000);
        });
        this.server.on('error', err => {
            vscode.window.showErrorMessage(`Voice Coder IPC error: ${err.message}`);
        });
    }

    // Push a message to all connected clients (used for cache-update events).
    broadcast(msg: OutboundMessage): void {
        const line = JSON.stringify(msg) + '\n';
        for (const s of this.sockets) {
            if (!s.destroyed) s.write(line);
        }
    }

    dispose(): void {
        for (const s of this.sockets) s.destroy();
        this.server.close();
    }

    // vscode.Disposable
    [Symbol.dispose](): void { this.dispose(); }

    private onConnection(socket: net.Socket): void {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));

        let buffer = '';
        socket.on('data', data => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                this.handle(trimmed, socket);
            }
        });
    }

    private async handle(raw: string, socket: net.Socket): Promise<void> {
        let msg: InboundMessage;
        try {
            msg = JSON.parse(raw) as InboundMessage;
        } catch {
            this.reply(socket, { ok: false, error: 'malformed JSON' });
            return;
        }

        try {
            await this.dispatch(msg, socket);
            this.reply(socket, { ok: true });
        } catch (err) {
            this.reply(socket, { ok: false, error: String(err) });
        }
    }

    private reply(socket: net.Socket, msg: OutboundMessage): void {
        if (!socket.destroyed) socket.write(JSON.stringify(msg) + '\n');
    }

    private editorSnapshot(): EditorSnapshot {
        const editor = vscode.window.activeTextEditor;
        return {
            fileName:     editor?.document.fileName.split('/').pop() ?? 'untitled',
            language:     editor?.document.languageId ?? 'plaintext',
            content:      editor?.document.getText() ?? '',
            cursorLine:   (editor?.selection.active.line ?? 0) + 1,
            cursorChar:   (editor?.selection.active.character ?? 0) + 1,
            selectedText: editor ? editor.document.getText(editor.selection) : '',
            cachePad:     this.cache.getItems(),
        };
    }

    private async dispatch(msg: InboundMessage, _socket: net.Socket): Promise<void> {
        const editor = vscode.window.activeTextEditor;

        switch (msg.cmd) {

            // --- Voice transcript — interpreted by Claude ---
            case 'transcript': {
                if (!this.claude) {
                    vscode.window.showWarningMessage(
                        'Voice Coder: LLM client not initialized (check voiceCoder.ollamaModel setting)'
                    );
                    return;
                }
                const snap = this.editorSnapshot();
                const status = vscode.window.setStatusBarMessage('$(loading~spin) Voice Coder: thinking…');
                const command = await this.claude.interpret(msg.text, snap);
                status.dispose();
                if (command) {
                    await this.dispatch(command as InboundMessage, _socket);
                }
                return;
            }

            // --- Text insertion ---
            case 'insertText': {
                if (!editor) return;
                const raw   = msg.text;
                const cursor = raw.indexOf('{CURSOR}');
                const text   = raw.replace('{CURSOR}', '');
                await editor.edit(eb => eb.insert(editor.selection.active, text));
                if (cursor !== -1) {
                    // Place cursor at the {CURSOR} marker position
                    const inserted = editor.selection.active;
                    // The marker was at `cursor` chars from the start of the inserted string.
                    // Walk back from the end of the insertion to find it.
                    const endOffset  = editor.document.offsetAt(inserted);
                    const markOffset = endOffset - (text.length - cursor);
                    const markPos    = editor.document.positionAt(markOffset);
                    editor.selection = new vscode.Selection(markPos, markPos);
                }
                break;
            }

            // --- Selection replacement (Claude code transforms) ---
            case 'replaceSelection': {
                if (!editor) return;
                await editor.edit(eb => eb.replace(editor.selection, msg.text));
                break;
            }

            // --- Navigation ---
            case 'gotoLine':
                await gotoLine(msg.line);
                break;
            case 'gotoWordOnLine':
                await gotoWordOnLine(msg.word, msg.line);
                break;
            case 'selectToken':
                await selectToken(msg.token);
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
                if (editor) this.cache.absorbDocument(editor.document);
                break;
            case 'evictCacheItem':
                this.cache.evict(msg.index);
                break;
            case 'clearCachePad':
                this.cache.clear();
                break;
            case 'syncCacheItems':
                this.cache.sync(msg.items);
                break;

            // --- Mode ---
            case 'setMode':
                this.statusBar.setMode(msg.mode);
                break;

            // --- Transaction mark ---
            case 'setMark': {
                if (!editor) return;
                this.mark = {
                    uri:    editor.document.uri.toString(),
                    text:   editor.document.getText(),
                    cursor: editor.selection.active,
                };
                vscode.window.setStatusBarMessage('$(bookmark) Voice Coder: mark set', 2000);
                break;
            }
            case 'undoTransaction': {
                if (!this.mark) {
                    vscode.window.showWarningMessage('Voice Coder: no mark set');
                    return;
                }
                if (!editor || editor.document.uri.toString() !== this.mark.uri) {
                    vscode.window.showWarningMessage('Voice Coder: mark is from a different file');
                    return;
                }
                const { text, cursor } = this.mark;
                this.mark = undefined;
                const fullRange = new vscode.Range(
                    editor.document.positionAt(0),
                    editor.document.positionAt(editor.document.getText().length),
                );
                await editor.edit(eb => eb.replace(fullRange, text));
                editor.selection = new vscode.Selection(cursor, cursor);
                vscode.window.setStatusBarMessage('$(discard) Voice Coder: transaction undone', 2000);
                break;
            }

            // --- Undo grouping ---
            case 'startUndoGroup':
                // VSCode doesn't expose a direct undo-group API; a no-op stop
                // inserted before and after a group achieves the same result.
                if (editor) await editor.edit(_eb => {}, { undoStopBefore: true, undoStopAfter: false });
                break;
            case 'endUndoGroup':
                if (editor) await editor.edit(_eb => {}, { undoStopBefore: false, undoStopAfter: true });
                break;

            // --- Char / word deletion ---
            case 'deleteChars':
                for (let i = 0; i < msg.n; i++)
                    await vscode.commands.executeCommand('deleteLeft');
                break;
            case 'selectChars': {
                if (!editor) break;
                const start  = editor.selection.active;
                const endOff = editor.document.offsetAt(start) + msg.n;
                const end    = editor.document.positionAt(Math.min(endOff, editor.document.getText().length));
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
                const vcCmd = VSCODE_COMMANDS[(msg as { cmd: string }).cmd];
                if (vcCmd) await vscode.commands.executeCommand(vcCmd);
                break;
            }
        }
    }
}
