import * as net from 'net';
import * as vscode from 'vscode';
import { InboundMessage, OutboundMessage } from './types';
import { CachePad } from './cachepad';
import { ModeStatusBar } from './statusbar';
import { gotoLine, gotoWordOnLine, selectToken, selectRange, jumpToCharOnLine } from './navigator';
import { ClaudeClient, EditorSnapshot } from './claudeClient';
import { fastInterpret, fastInterpretMulti } from './fastPath';
import { tryTransform } from './codeTransform';
import { showCommandsPanel } from './commandsPanel';
import type { ExtensionContext } from 'vscode';

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
    matchParen:         'editor.action.jumpToBracket',
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
    private llmAbort: AbortController | null = null;

    constructor(
        port: number,
        private cache: CachePad,
        private statusBar: ModeStatusBar,
        private context: ExtensionContext,
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
        const visible = editor?.visibleRanges[0];
        return {
            fileName:     editor?.document.fileName.split('/').pop() ?? 'untitled',
            language:     editor?.document.languageId ?? 'plaintext',
            content:      editor?.document.getText() ?? '',
            cursorLine:   (editor?.selection.active.line ?? 0) + 1,
            cursorChar:   (editor?.selection.active.character ?? 0) + 1,
            selectedText: editor ? editor.document.getText(editor.selection) : '',
            cachePad:     this.cache.getItems(),
            visibleStart: (visible?.start.line ?? 0) + 1,
            visibleEnd:   (visible?.end.line ?? 0) + 1,
        };
    }

    private async dispatch(msg: InboundMessage, _socket: net.Socket): Promise<void> {
        const editor = vscode.window.activeTextEditor;

        switch (msg.cmd) {

            // --- Voice transcript — interpreted by Claude ---
            case 'transcript': {
                // Cancel any in-flight LLM call so its stale result is never dispatched.
                this.llmAbort?.abort();
                this.llmAbort = null;

                const raw = msg.text;

                // Dictation mode: insert transcript verbatim, no LLM.
                if (this.statusBar.getMode() === 'dictation') {
                    if (editor) {
                        await editor.edit(eb => eb.insert(editor.selection.active, raw + ' '));
                        vscode.window.setStatusBarMessage(`$(keyboard) "${raw}"`, 10000);
                    }
                    return;
                }

                if (!this.claude) {
                    vscode.window.showWarningMessage(
                        'Voice Coder: LLM client not initialized (check pbv.ollamaModel setting)'
                    );
                    return;
                }
                const { commands, remainder } = fastInterpretMulti(raw);
                if (commands.length > 0) {
                    const labels = commands.map(c => this.describeCmd(c as InboundMessage)).join(' | ');
                    vscode.window.setStatusBarMessage(`$(mic) "${raw}" → ${labels}`, 10000);
                    for (const cmd of commands) {
                        await this.dispatch(cmd as InboundMessage, _socket);
                    }
                    if (!remainder) return;
                    // Non-empty remainder falls through to LLM below.
                }
                // Use remainder for LLM if fast path consumed a prefix,
                // or the full utterance if nothing was consumed.
                const llmInput = remainder || raw;
                if (commands.length > 0 && !remainder) return;
                const snap = this.editorSnapshot();

                // Rule-based transform fast path (selected text + known utterance).
                if (snap.selectedText) {
                    const transformed = tryTransform(raw, snap.selectedText, snap.language);
                    if (transformed !== null) {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            this.mark = { uri: editor.document.uri.toString(), text: editor.document.getText(), cursor: editor.selection.active };
                            editor.selection = vscode.window.activeTextEditor!.selection;
                            vscode.window.setStatusBarMessage(`$(mic) "${raw}" → replaceSelection`, 10000);
                            await this.dispatch({ cmd: 'replaceSelection', text: transformed } as InboundMessage, _socket);
                        }
                        return;
                    }
                }
                const savedSelection = vscode.window.activeTextEditor?.selection;
                const abort = new AbortController();
                this.llmAbort = abort;
                const status = vscode.window.setStatusBarMessage(`$(loading~spin) "${llmInput}" → thinking…`);
                const command = await this.claude.interpret(llmInput, snap, abort.signal);
                status.dispose();
                this.llmAbort = null;
                if (abort.signal.aborted) return;
                if (!command) {
                    vscode.window.setStatusBarMessage(`$(mic) "${llmInput}" → (no command)`, 10000);
                    return;
                }
                if (command) {
                    const cmd = command as InboundMessage;
                    vscode.window.setStatusBarMessage(
                        `$(mic) "${llmInput}" → ${this.describeCmd(cmd)}`, 10000);
                    const isBufferEdit = cmd.cmd === 'replaceSelection' || cmd.cmd === 'insertText';

                    // Warn if selected text was present but LLM returned a non-editing command.
                    if (snap.selectedText && !isBufferEdit) {
                        vscode.window.showWarningMessage(
                            `Voice Coder: selection ignored — LLM returned "${cmd.cmd}" instead of an edit`
                        );
                        return;
                    }

                    // Auto-setMark before any LLM-generated buffer edit so "undo transaction"
                    // always reverts it.
                    if (isBufferEdit) {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            this.mark = {
                                uri:    editor.document.uri.toString(),
                                text:   editor.document.getText(),
                                cursor: editor.selection.active,
                            };
                        }
                        // Restore selection captured before the LLM wait.
                        if (cmd.cmd === 'replaceSelection' && savedSelection) {
                            const editor = vscode.window.activeTextEditor;
                            if (editor) editor.selection = savedSelection;
                        }
                    }

                    await this.dispatch(cmd, _socket);
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
            case 'jumpToCharOnLine':
                await jumpToCharOnLine(msg.ordinal, msg.char, msg.line);
                break;
            case 'selectToken':
                await selectToken(msg.token);
                break;
            case 'selectRange':
                await selectRange(msg.startToken, msg.endToken);
                break;
            case 'cacheSelection': {
                const sel = vscode.window.activeTextEditor;
                if (sel) {
                    const text = sel.document.getText(sel.selection);
                    if (text) this.cache.prependExplicit(text);
                    else this.cache.cacheWordAtCursor();
                }
                break;
            }
            case 'selectAndCacheToken': {
                await selectToken(msg.token);
                const ste = vscode.window.activeTextEditor;
                if (ste) {
                    const text = ste.document.getText(ste.selection);
                    if (text) this.cache.prependExplicit(text);
                }
                break;
            }
            case 'selectAndCacheRange': {
                await selectRange(msg.startToken, msg.endToken);
                const str = vscode.window.activeTextEditor;
                if (str) {
                    const text = str.document.getText(str.selection);
                    if (text) this.cache.prependExplicit(text);
                }
                break;
            }
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
                    const text = (msg.prefix ?? '') + sym;
                    await editor.edit(eb => eb.insert(editor.selection.active, text));
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

            // --- Mode / readiness ---
            case 'setMode':
                this.statusBar.setMode(msg.mode);
                break;
            case 'setReady':
                this.statusBar.setReady(msg.ready);
                break;
            case 'commandMode':
                this.statusBar.setMode('command');
                break;
            case 'dictationMode':
                this.statusBar.setMode('dictation');
                break;

            // --- Voice-only UI access ---
            case 'showCommands':
                showCommandsPanel(this.context);
                break;
            case 'showCachePad':
                await vscode.commands.executeCommand('pbv.cachePad.focus');
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
            case 'jumpToMark': {
                if (!this.mark) {
                    vscode.window.showWarningMessage('Voice Coder: no mark set');
                    return;
                }
                if (!editor || editor.document.uri.toString() !== this.mark.uri) {
                    vscode.window.showWarningMessage('Voice Coder: mark is from a different file');
                    return;
                }
                editor.selection = new vscode.Selection(this.mark.cursor, this.mark.cursor);
                editor.revealRange(new vscode.Range(this.mark.cursor, this.mark.cursor),
                    vscode.TextEditorRevealType.InCenter);
                vscode.window.setStatusBarMessage('$(bookmark) Voice Coder: jumped to mark', 2000);
                break;
            }
            case 'selectWord': {
                if (!editor) return;
                const wordRange = editor.document.getWordRangeAtPosition(
                    editor.selection.active);
                if (wordRange) editor.selection = new vscode.Selection(
                    wordRange.start, wordRange.end);
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

    private describeCmd(cmd: InboundMessage): string {
        const c = cmd as Record<string, unknown>;
        switch (cmd.cmd) {
            case 'gotoLine':         return `gotoLine ${c.line}`;
            case 'gotoWordOnLine':   return `word ${c.word} on line ${c.line}`;
            case 'cursorUp':         return `up ${c.n ?? 1}`;
            case 'cursorDown':       return `down ${c.n ?? 1}`;
            case 'insertCacheItem':  return `${c.prefix ?? ''}cache[${c.index}]`;
            case 'jumpToCharOnLine': return `jump [${c.ordinal}] '${c.char}' line ${c.line}`;
            case 'deleteChars':      return `deleteChars ${c.n}`;
            case 'deleteWords':      return `deleteWords ${c.n}`;
            case 'insertText':       return `insertText "${String(c.text).slice(0, 30)}"`;
            case 'replaceSelection': return `replaceSelection`;
            case 'selectToken':      return `selectToken "${c.token}"`;
            default:                 return cmd.cmd;
        }
    }
}
