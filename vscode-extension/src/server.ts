import * as net from 'net';
import * as vscode from 'vscode';
import { InboundMessage, OutboundMessage } from './types';
import { CachePad } from './cachepad';
import { ModeStatusBar } from './statusbar';
import { gotoLine, gotoWordOnLine, selectToken, selectRange, jumpToCharOnLine } from './navigator';
import { ClaudeClient, EditorSnapshot } from './claudeClient';
import { fastInterpret, fastInterpretMulti, natoToChar, NATO_WORDS } from './fastPath';
import { tryTransform } from './codeTransform';
import { showCommandsPanel } from './commandsPanel';
import type { ExtensionContext } from 'vscode';

// Map action names from core.yaml to built-in VSCode command IDs.
const VSCODE_COMMANDS: Record<string, string> = {
    acceptCompletion:   'acceptSelectedSuggestion',
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
    saveAs:             'workbench.action.files.saveAs',
    newFile:            'workbench.action.files.newUntitledFile',
    closeFile:          'workbench.action.closeActiveEditor',
    nextFile:           'workbench.action.nextEditor',
    previousFile:       'workbench.action.previousEditor',
    reopenFile:         'workbench.action.reopenClosedEditor',
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

// Commands that should not fire on low-confidence (uncertain) transcripts.
// Destructive / hard-to-reverse operations where a mishearing is costly.
const DESTRUCTIVE_CMDS = new Set([
    'clearCachePad', 'deleteLine', 'deleteToEndOfLine',
    'deleteWords', 'deleteChars', 'undoTransaction', 'revertTransactions',
]);

interface Mark {
    uri:    string;
    text:   string;
    cursor: vscode.Position;
}

interface TxFrame {
    uri:       string;
    startLine: number;
    endLine:   number | null;
}

// Gutter dot colors: index 0 = top of stack (darkest green), index 3 = oldest visible.
const TX_COLORS = ['#1a7a1a', '#4ca64c', '#80c080', '#b3d9b3'];

function txGutterIcon(color: string): vscode.Uri {
    const hex = color.replace('#', '%23');
    return vscode.Uri.parse(
        `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'>` +
        `<circle cx='7' cy='7' r='5' fill='${hex}'/></svg>`
    );
}

export class IpcServer {
    private server: net.Server;
    private sockets = new Set<net.Socket>();
    private port: number;
    private mark: Mark | undefined;
    private llmAbort: AbortController | null = null;

    // Navigation bookmark — set explicitly by voice or auto-set on traversal entry.
    // Separate from `mark` (which is the undo-transaction anchor and is overwritten
    // on every LLM buffer edit).
    private navMark: { uri: string; cursor: vscode.Position } | undefined;

    // Transaction stack — each startUndoGroup pushes a frame; revertTransactions pops N.
    private txStack: TxFrame[] = [];
    private txDecoTypes: vscode.TextEditorDecorationType[] = [];

    // Scroll / traversal state
    private traversalMatches: { start: vscode.Position; end: vscode.Position }[] | null = null;
    private traversalIndex   = 0;

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
            vscode.window.setStatusBarMessage(`PBV: listening on :${port}`, 3000);
        });
        this.server.on('error', err => {
            vscode.window.showErrorMessage(`PBV IPC error: ${err.message}`);
        });

        // One decoration type per color shade, created once and reused.
        this.txDecoTypes = TX_COLORS.map(color =>
            vscode.window.createTextEditorDecorationType({
                gutterIconPath: txGutterIcon(color),
                gutterIconSize: 'contain',
            })
        );
        context.subscriptions.push(...this.txDecoTypes);

        // Refresh gutter dots when the user switches to a different editor tab.
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.refreshTxDecorations())
        );

        // Register keybinding targets for Ctrl+Down / Ctrl+Up in scroll mode.
        // The 'when: "pbv.scrolling"' clause in package.json ensures these only
        // fire while scroll/traversal mode is active.
        context.subscriptions.push(
            vscode.commands.registerCommand('pbv.scrollStep',     () => this.scrollStep(1)),
            vscode.commands.registerCommand('pbv.scrollStepBack', () => this.scrollStep(-1)),
        );
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

                // Drop Whisper artifact-only transcripts ([BLANK_AUDIO], [MUSIC], etc.)
                if (/^\s*(\[[A-Z_]+\]\s*)+$/.test(raw)) return;

                const { commands, remainder } = fastInterpretMulti(raw);

                // Dictation mode: insert verbatim — but mode-switch commands
                // must still fire so there is always a voice path back to command mode.
                if (this.statusBar.getMode() === 'dictation') {
                    const modeCmd = commands.length === 1 && !remainder
                        ? (commands[0] as Record<string, unknown>).cmd as string
                        : '';
                    if (modeCmd === 'commandMode' || modeCmd === 'dictationMode') {
                        await this.dispatch(commands[0] as InboundMessage, _socket);
                        return;
                    }
                    if (editor) {
                        const dictated = normalizeDictation(raw);
                        await editor.edit(eb => eb.insert(editor.selection.active, dictated + ' '));
                        vscode.window.setStatusBarMessage(`$(keyboard) "${raw}"`, 10000);
                    }
                    return;
                }

                if (commands.length > 0) {
                    const lowConf = !!(msg as any).lowConfidence;
                    const labels = commands.map(c => this.describeCmd(c as InboundMessage)).join(' | ');
                    vscode.window.setStatusBarMessage(`$(mic) "${raw}" → ${labels}`, 10000);
                    for (const cmd of commands) {
                        const cmdName = (cmd as any).cmd as string;
                        if (lowConf && DESTRUCTIVE_CMDS.has(cmdName)) {
                            vscode.window.setStatusBarMessage(
                                `$(warning) "${raw}" → skipped ${cmdName} (low confidence)`, 10000);
                            continue;
                        }
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

                // Select-and-Say: if the selection is an ALL_CAPS_TEMPLATE placeholder,
                // replace it verbatim without the LLM — no "dictate" prefix needed.
                if (/^[A-Z][A-Z0-9_]*_TEMPLATE$/.test(snap.selectedText.trim())) {
                    vscode.window.setStatusBarMessage(`$(mic) "${raw}" → replaceSelection`, 10000);
                    await this.dispatch({ cmd: 'dictateText', text: llmInput } as InboundMessage, _socket);
                    return;
                }

                if (!this.claude) {
                    vscode.window.showWarningMessage(
                        'PBV: LLM client not initialized (check pbv.ollamaModel setting)'
                    );
                    return;
                }

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
                        vscode.window.setStatusBarMessage(
                            `$(warning) PBV: selection ignored — LLM returned "${cmd.cmd}" instead of an edit`, 5000
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

            // Verbatim insertion without LLM — replaces selection or inserts at cursor.
            // "dictate Word Frequency Counter" → inserts those exact words.
            case 'dictateText': {
                if (!editor) return;
                const sel      = editor.selection;
                const dictated = normalizeDictation(msg.text as string);
                await editor.edit(eb =>
                    sel.isEmpty
                        ? eb.insert(sel.active, dictated)
                        : eb.replace(sel, dictated)
                );
                break;
            }

            case 'sectionHeader': {
                if (!editor) break;
                const COMMENT: Record<string, string> = {
                    python: '#', terraform: '#', yaml: '#', shellscript: '#',
                    go: '//', typescript: '//', javascript: '//', rust: '//', c: '//', cpp: '//',
                };
                const ch        = COMMENT[editor.document.languageId] ?? '#';
                const dashes    = `${ch} ${'-'.repeat(75)}`;
                const raw       = msg.label as string;
                const label     = raw ? normalizeDictation(raw) : 'LABEL_TEMPLATE';
                const startLine = editor.selection.active.line;
                await editor.edit(eb =>
                    eb.insert(editor.selection.active,
                        `${dashes}\n${ch} ${label}\n${dashes}\n`));
                if (raw) {
                    // Filled: cursor on the blank line after the block.
                    const after = new vscode.Position(startLine + 3, 0);
                    editor.selection = new vscode.Selection(after, after);
                } else {
                    // Template: select LABEL_TEMPLATE so Select-and-Say fires immediately.
                    const col   = ch.length + 1;  // skip "ch " prefix
                    const start = new vscode.Position(startLine + 1, col);
                    const end   = new vscode.Position(startLine + 1, col + 'LABEL_TEMPLATE'.length);
                    editor.selection = new vscode.Selection(start, end);
                }
                break;
            }

            case 'underlineLine': {
                if (!editor) break;
                const cursorLine = editor.selection.active.line;
                const aboveLine  = cursorLine > 0
                    ? editor.document.lineAt(cursorLine - 1).text.trimEnd()
                    : '';
                const len  = aboveLine.length;
                const char = (msg.char as string) || '=';
                const text = len > 0 ? char.repeat(len) : char.repeat(20);
                const lineRange = editor.document.lineAt(cursorLine).range;
                await editor.edit(eb => eb.replace(lineRange, text));
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
            case 'closeString': {
                if (!editor) return;
                await vscode.commands.executeCommand('deleteLeft');
                await editor.edit(eb => eb.insert(editor.selection.active, '"'));
                break;
            }

            // --- Scroll / traversal mode ---
            case 'enterScrollMode':
                this.traversalMatches = null;
                this.statusBar.setScrollMode({ active: true, kind: 'scroll', direction: msg.direction });
                await vscode.commands.executeCommand('setContext', 'pbv.scrolling', true);
                break;

            case 'enterTraversalMode': {
                const ed = vscode.window.activeTextEditor;
                if (ed) {
                    // Auto-set navigation bookmark so "jump to mark" always returns here.
                    this.navMark = {
                        uri:    ed.document.uri.toString(),
                        cursor: ed.selection.active,
                    };
                    const regex   = traversalRegex(ed.document.languageId, msg.pattern);
                    const text    = ed.document.getText();
                    const matches: { start: vscode.Position; end: vscode.Position }[] = [];
                    let m: RegExpExecArray | null;
                    while ((m = regex.exec(text)) !== null) {
                        matches.push({
                            start: ed.document.positionAt(m.index),
                            end:   ed.document.positionAt(m.index + m[0].length),
                        });
                    }
                    this.traversalMatches = matches;
                    this.traversalIndex   = 0;
                    vscode.window.setStatusBarMessage(
                        `$(list-selection) PBV: traversing ${matches.length} match${matches.length === 1 ? '' : 'es'}`,
                        4000
                    );
                }
                this.statusBar.setScrollMode({ active: true, kind: 'traverse' });
                await vscode.commands.executeCommand('setContext', 'pbv.scrolling', true);
                break;
            }

            case 'exitScrollMode':
                this.traversalMatches = null;
                this.statusBar.setScrollMode({ active: false });
                await vscode.commands.executeCommand('setContext', 'pbv.scrolling', false);
                break;

            case 'scrollStep':
                await this.scrollStep(msg.direction === 'back' ? -1 : 1);
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
            case 'cacheAndAssign': {
                this.cache.cacheWordAtOrBeforeCursor();
                if (editor) await editor.edit(eb => eb.insert(editor.selection.active, ' = '));
                break;
            }
            case 'refreshCachePad':
                this.cache.unsuppress();
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
                vscode.window.setStatusBarMessage('$(bookmark) PBV: mark set', 2000);
                break;
            }
            case 'jumpToMark': {
                if (!this.mark) {
                    vscode.window.showWarningMessage('PBV: no mark set');
                    return;
                }
                if (!editor || editor.document.uri.toString() !== this.mark.uri) {
                    vscode.window.showWarningMessage('PBV: mark is from a different file');
                    return;
                }
                editor.selection = new vscode.Selection(this.mark.cursor, this.mark.cursor);
                editor.revealRange(new vscode.Range(this.mark.cursor, this.mark.cursor),
                    vscode.TextEditorRevealType.InCenter);
                vscode.window.setStatusBarMessage('$(bookmark) PBV: jumped to mark', 2000);
                break;
            }

            // Navigation bookmark — not overwritten by buffer edits; auto-set on traversal entry.
            case 'setNavMark': {
                if (!editor) return;
                this.navMark = {
                    uri:    editor.document.uri.toString(),
                    cursor: editor.selection.active,
                };
                vscode.window.setStatusBarMessage('$(location) PBV: nav mark set', 2000);
                break;
            }
            case 'jumpToNavMark': {
                if (!this.navMark) {
                    vscode.window.showWarningMessage('PBV: no nav mark set');
                    return;
                }
                if (!editor || editor.document.uri.toString() !== this.navMark.uri) {
                    vscode.window.showWarningMessage('PBV: nav mark is from a different file');
                    return;
                }
                editor.selection = new vscode.Selection(this.navMark.cursor, this.navMark.cursor);
                editor.revealRange(
                    new vscode.Range(this.navMark.cursor, this.navMark.cursor),
                    vscode.TextEditorRevealType.InCenter
                );
                vscode.window.setStatusBarMessage('$(location) PBV: jumped to nav mark', 2000);
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
            case 'undoTransaction':
                await this.dispatch({ cmd: 'revertTransactions', n: 1 }, _socket);
                break;

            case 'revertTransactions': {
                const requested = msg.n;
                const available = this.txStack.length;
                if (available === 0) {
                    vscode.window.setStatusBarMessage('$(warning) PBV: no transactions on stack', 3000);
                    break;
                }
                let count = requested;
                if (requested > available) {
                    const overflow = vscode.workspace
                        .getConfiguration('pbv')
                        .get<string>('revertOverflow', 'warn');
                    if (overflow === 'error') {
                        vscode.window.setStatusBarMessage(
                            `$(warning) PBV: only ${available} transaction(s) on stack`, 3000);
                        break;
                    }
                    vscode.window.setStatusBarMessage(
                        `$(warning) PBV: only ${available} transaction(s) — reverting all`, 3000);
                    count = available;
                }
                this.txStack.splice(this.txStack.length - count, count);
                for (let i = 0; i < count; i++)
                    await vscode.commands.executeCommand('undo');
                this.refreshTxDecorations();
                vscode.window.setStatusBarMessage(
                    `$(discard) PBV: reverted ${count} transaction(s)`, 2000);
                break;
            }

            // --- Undo grouping ---
            case 'startUndoGroup': {
                // VSCode doesn't expose a direct undo-group API; a no-op stop
                // inserted before and after a group achieves the same result.
                if (editor) {
                    await editor.edit(_eb => {}, { undoStopBefore: true, undoStopAfter: false });
                    this.txStack.push({
                        uri:       editor.document.uri.toString(),
                        startLine: editor.selection.active.line,
                        endLine:   null,
                    });
                    this.refreshTxDecorations();
                }
                break;
            }
            case 'endUndoGroup': {
                if (editor) {
                    await editor.edit(_eb => {}, { undoStopBefore: false, undoStopAfter: true });
                    const top = this.txStack[this.txStack.length - 1];
                    if (top && top.uri === editor.document.uri.toString())
                        top.endLine = editor.selection.active.line;
                    this.refreshTxDecorations();
                }
                break;
            }

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

    private refreshTxDecorations(): void {
        const editor = vscode.window.activeTextEditor;
        // Clear all shades first.
        for (const dt of this.txDecoTypes) {
            if (editor) editor.setDecorations(dt, []);
        }
        if (!editor) return;
        const uri = editor.document.uri.toString();
        // Assign shades newest-first: txStack[last] is top (darkest).
        const byShade: vscode.DecorationOptions[][] = TX_COLORS.map(() => []);
        const stackLen = this.txStack.length;
        for (let i = 0; i < stackLen; i++) {
            const frame = this.txStack[i];
            if (frame.uri !== uri) continue;
            // Depth from top: 0 = top of stack.
            const depth = stackLen - 1 - i;
            const shadeIdx = Math.min(depth, TX_COLORS.length - 1);
            const lineCount = editor.document.lineCount;
            if (frame.startLine < lineCount)
                byShade[shadeIdx].push({ range: new vscode.Range(frame.startLine, 0, frame.startLine, 0) });
            if (frame.endLine !== null && frame.endLine < lineCount && frame.endLine !== frame.startLine)
                byShade[shadeIdx].push({ range: new vscode.Range(frame.endLine, 0, frame.endLine, 0) });
        }
        for (let i = 0; i < this.txDecoTypes.length; i++)
            editor.setDecorations(this.txDecoTypes[i], byShade[i]);
    }

    private async scrollStep(direction: 1 | -1): Promise<void> {
        if (this.traversalMatches && this.traversalMatches.length > 0) {
            this.traversalIndex =
                (this.traversalIndex + direction + this.traversalMatches.length) %
                this.traversalMatches.length;
            const match  = this.traversalMatches[this.traversalIndex];
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const selectOnTraverse = vscode.workspace
                    .getConfiguration('pbv')
                    .get<boolean>('selectOnTraverse', false);
                editor.selection = selectOnTraverse
                    ? new vscode.Selection(match.start, match.end)
                    : new vscode.Selection(match.start, match.start);
                editor.revealRange(
                    new vscode.Range(match.start, match.end),
                    vscode.TextEditorRevealType.InCenter
                );
            }
        } else {
            await vscode.commands.executeCommand(
                direction > 0 ? 'scrollLineDown' : 'scrollLineUp'
            );
        }
    }

    private describeCmd(cmd: InboundMessage): string {
        const c = cmd as Record<string, unknown>;
        switch (cmd.cmd) {
            case 'gotoLine':            return `gotoLine ${c.line}`;
            case 'gotoWordOnLine':      return `word ${c.word} on line ${c.line}`;
            case 'cursorUp':            return `up ${c.n ?? 1}`;
            case 'cursorDown':          return `down ${c.n ?? 1}`;
            case 'insertCacheItem':     return `${c.prefix ?? ''}cache[${c.index}]`;
            case 'jumpToCharOnLine':    return `jump [${c.ordinal}] '${c.char}' line ${c.line}`;
            case 'deleteChars':         return `deleteChars ${c.n}`;
            case 'deleteWords':         return `deleteWords ${c.n}`;
            case 'insertText':          return `insertText "${String(c.text).slice(0, 30)}"`;
            case 'replaceSelection':    return `replaceSelection`;
            case 'selectToken':         return `selectToken "${c.token}"`;
            case 'enterScrollMode':     return `enterScrollMode(${(c as any).direction})`;
            case 'enterTraversalMode':  return `enterTraversalMode`;
            case 'exitScrollMode':      return `exitScrollMode`;
            default:                    return cmd.cmd;
        }
    }
}

// ---------------------------------------------------------------------------
// Traversal regex patterns — language-aware defaults + custom override
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Dictation punctuation normalization
// ---------------------------------------------------------------------------
// Converts spoken punctuation words to symbols, Dragon-style.
// Applied to all verbatim-inserted text (dictation mode + Select-and-Say).
// Rules attach punctuation to the preceding word and preserve following space.

// Pre-built regex for sequences of 2+ consecutive NATO words → abbreviation.
// Single NATO words are not contracted (too many false positives: echo, golf, mike…).
// "romeo echo" → "re",  "sierra yankee sierra" → "sys"
const NATO_SEQ_RE = (() => {
    const words = [...NATO_WORDS].join('|');
    return new RegExp(`\\b(?:${words})(?:\\s+(?:${words}))+\\b`, 'gi');
})();

export function normalizeDictation(text: string): string {
    let t = text;
    // Strip Whisper's auto-inserted sentence-end periods ("romeo. Echo." → "romeo Echo").
    // In code dictation, bare periods from Whisper are always noise — real periods
    // come from the user saying "period" (the word), handled below.
    t = t.replace(/\.(\s+)/g, '$1').replace(/\.$/, '');
    // Explicit "letter X" → single char (safe in any context)
    t = t.replace(/\bletter\s+([a-z][a-z-]*)/gi, (_, w) => natoToChar(w));
    // Bare sequences of 2+ consecutive NATO words → abbreviation
    // "romeo echo" → "re",  used in 'dictate' for module names like 're', 'os', 'sys'
    t = t.replace(NATO_SEQ_RE, match =>
        match.split(/\s+/).map(w => natoToChar(w.toLowerCase())).join('')
    );
    // Dragon-style word modifiers — applied after letter contractions so
    // "cap letter romeo" → 'R' and "default no-space dict" → "defaultdict".
    // no-space is parked as a join marker first so "no-space cap dict" → "Dict"
    // attached to the previous word works even when cap follows no-space.
    t = t.replace(/\s+no[\s-]space\s+/gi, '\x00');
    t = t.replace(/\b(?:cap|capitalize)\s+(\w)(\w*)/gi, (_, f, r) => f.toUpperCase() + r);
    t = t.replace(/\x00/g, '');
    // Closing punctuation: remove preceding space, attach to prior word.
    t = t
        .replace(/\bnew\s*line\b/gi,                  '\n')
        .replace(/\s+comma\b/gi,                     ',')
        .replace(/\s+period\b/gi,                    '.')
        .replace(/\s+full\s+stop\b/gi,               '.')
        .replace(/\s+exclamation\s+(?:mark|point)\b/gi, '!')
        .replace(/\s+question\s+mark\b/gi,           '?')
        .replace(/\s+colon\b/gi,                     ':')
        .replace(/\s+semicolon\b/gi,                 ';')
        .replace(/\s+hyphen\b\s*/gi,                 '-')
        .replace(/\s+dash\b/gi,                      ' —')
        .replace(/\s+apostrophe\b\s*/gi,             "'")
        .replace(/\s+close\s+(?:paren|parenthesis)\b/gi, ')')
        .replace(/\s+close\s+(?:bracket|square\s+bracket)\b/gi, ']')
        .replace(/\s+close\s+(?:brace|curly)\b/gi,  '}')
        .replace(/\s+close\s+quote\b/gi,             '"');
    // Opening punctuation: keep preceding space, remove following space.
    t = t
        .replace(/\bopen\s+(?:paren|parenthesis)\s+/gi,  '(')
        .replace(/\bopen\s+(?:bracket|square\s+bracket)\s+/gi, '[')
        .replace(/\bopen\s+(?:brace|curly)\s+/gi,        '{')
        .replace(/\bopen\s+quote\s+/gi,                  '"');
    // Merge adjacent single-letter contractions: "r e" → "re", "r e n" → "ren"
    // Handles Whisper splitting "letter romeo letter echo" across sentence boundaries.
    t = t.replace(/\b([a-z])\s+(?=[a-z]\b)/g, '$1');
    return t;
}

function traversalRegex(languageId: string, pattern?: string): RegExp {
    if (pattern) return new RegExp(pattern, 'gm');
    switch (languageId) {
        case 'python':                   return /^\s*def\s+\w+/gm;
        case 'go':                       return /^func\s+\w+/gm;
        case 'typescript':
        case 'javascript':               return /^(?:export\s+)?(?:async\s+)?function\s+\w+/gm;
        case 'rust':                     return /^(?:pub\s+)?fn\s+\w+/gm;
        default:                         return /^[^\s#\/\*].*[:{]\s*$/gm;
    }
}
