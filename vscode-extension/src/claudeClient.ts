import * as vscode from 'vscode';

const SYSTEM_PROMPT = `You are a voice coding assistant. Map each utterance to exactly one JSON command object. \
The utterance may be slightly misrecognized by speech-to-text — snap it to the nearest valid command in the grammar below. \
If a "Selected code:" block is present, the utterance is a transformation request — return replaceSelection with the transformed code.

COMMAND GRAMMAR (canonical spoken forms → cmd):
• "go to line N"                              → gotoLine {line:N}
• "word N on line M"                          → gotoWordOnLine {word:N, line:M}
• "up/down [N]", "left/right [N]"             → cursorUp/Down/Left/Right {n:N}
• "home", "end", "top", "bottom"              → cursorHome/End/Top/Bottom
• "page up", "page down"                      → pageUp/pageDown
• "select <token>"       → selectToken — token MUST appear verbatim in the Content excerpt
• "select range <A> through <B>"             → selectRange {startToken, endToken} — from excerpt
• "select and cache <token>"                 → selectAndCacheToken — token from excerpt
• "select and cache <A> through <B>"         → selectAndCacheRange — tokens from excerpt
• "cache N" / "recent N"                     → insertCacheItem {index:N}
• "delete [N] word(s)"                       → deleteWords {n:N}
• "delete [N] character(s)"                  → deleteChars {n:N}
• "delete line"                              → deleteLine
• "delete to end"                            → deleteToEndOfLine
• "set mark"                                 → setMark
• "undo transaction"                         → undoTransaction
• "undo", "redo", "save", "format"           → undo/redo/save/formatDocument
• "comment line"                             → toggleLineComment
• "select all", "copy", "cut", "paste"       → selectAll/copy/cut/paste`;

// Few-shot examples injected as conversation turns — stronger signal than system prompt text
// for small models. Keep in sync with the command set in OUTPUT_SCHEMA.
// Only the commands that small models get wrong without examples.
const FEW_SHOT: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user',      content: 'Utterance: "set mark"' },
    { role: 'assistant', content: '{"cmd":"setMark"}' },
    { role: 'user',      content: 'Utterance: "undo transaction"' },
    { role: 'assistant', content: '{"cmd":"undoTransaction"}' },
    { role: 'user',      content: 'Utterance: "cache 2"' },
    { role: 'assistant', content: '{"cmd":"insertCacheItem","index":2}' },
    // camelCase / snake_case aware selection — resolve spoken form to actual token in excerpt
    { role: 'user',      content: 'Utterance: "select my variable name"\nLanguage: python\nContent excerpt: result = myVariableName + offset' },
    { role: 'assistant', content: '{"cmd":"selectToken","token":"myVariableName"}' },
    { role: 'user',      content: 'Utterance: "select output file name"\nLanguage: python\nContent excerpt: open(output_file_name, "r")' },
    { role: 'assistant', content: '{"cmd":"selectToken","token":"output_file_name"}' },
    // selectRange — "select range X through Y" selects from X to end of Y (works in comments too)
    { role: 'user',      content: 'Utterance: "select range score through ago"\nLanguage: markdown\nContent excerpt: Four score and seven years ago our fathers' },
    { role: 'assistant', content: '{"cmd":"selectRange","startToken":"score","endToken":"ago"}' },
    { role: 'user',      content: 'Utterance: "select range raises through error"\nLanguage: python\nContent excerpt: # raises ValueError if input is not a valid error' },
    { role: 'assistant', content: '{"cmd":"selectRange","startToken":"raises","endToken":"error"}' },
    // selectAndCache — select text AND push it to the cache pad in one step
    { role: 'user',      content: 'Utterance: "select and cache gig through flag"\nLanguage: python\nContent excerpt: "gig_worker_flag": False,' },
    { role: 'assistant', content: '{"cmd":"selectAndCacheRange","startToken":"gig","endToken":"flag"}' },
    { role: 'user',      content: 'Utterance: "select and cache triage completed"\nLanguage: python\nContent excerpt: triage_completed = check_status()' },
    { role: 'assistant', content: '{"cmd":"selectAndCacheToken","token":"triage_completed"}' },
    // misrecognition snapping — "who" is a mishearing of "my"; still resolves to the token in the excerpt
    { role: 'user',      content: 'Utterance: "select who variable name"\nLanguage: python\nContent excerpt: result = myVariableName + offset' },
    { role: 'assistant', content: '{"cmd":"selectToken","token":"myVariableName"}' },
];

const OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
        cmd: {
            type: 'string',
            enum: [
                'insertText', 'replaceSelection',
                'gotoLine', 'gotoWordOnLine',
                'cursorUp', 'cursorDown', 'cursorLeft', 'cursorRight',
                'cursorHome', 'cursorEnd', 'cursorTop', 'cursorBottom',
                'pageUp', 'pageDown',
                'selectToken', 'selectRange',
                'cacheSelection', 'selectAndCacheToken', 'selectAndCacheRange',
                'insertCacheItem',
                'deleteChars', 'deleteWords', 'deleteLine', 'deleteToEndOfLine',
                'setMark', 'undoTransaction',
                'undo', 'redo', 'save', 'formatDocument',
                'toggleLineComment', 'selectAll', 'copy', 'cut', 'paste',
            ],
        },
        line:  { type: 'number' },
        word:  { type: 'number' },
        text:  { type: 'string' },
        token:      { type: 'string' },
        startToken: { type: 'string' },
        endToken:   { type: 'string' },
        n:     { type: 'number' },
        index: { type: 'number' },
    },
    required: ['cmd'],
};

export interface EditorSnapshot {
    fileName:       string;
    language:       string;
    content:        string;
    cursorLine:     number;   // 1-based
    cursorChar:     number;   // 1-based
    selectedText:   string;
    cachePad:       string[];
    visibleStart:   number;   // 1-based, first visible line
    visibleEnd:     number;   // 1-based, last visible line
}

interface OllamaResponse {
    message: { role: string; content: string };
}

export class ClaudeClient {
    private model: string;
    private baseUrl: string;

    constructor(model: string, baseUrl = 'http://localhost:11434') {
        this.model   = model;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async interpret(transcript: string, snap: EditorSnapshot, signal?: AbortSignal): Promise<object | null> {
        const excerpt = windowForLines(snap.content, snap.visibleStart, snap.visibleEnd);
        const parts = [
            `Language: ${snap.language}`,
            `Cursor: line ${snap.cursorLine}, char ${snap.cursorChar}`,
            `Cache pad: ${snap.cachePad.length ? snap.cachePad.join(', ') : '(empty)'}`,
            `Content excerpt:\n${excerpt}`,
            `Utterance: "${transcript}"`,
        ];
        if (snap.selectedText) {
            parts.push(`Selected code:\n${snap.selectedText}`);
        }
        const userMsg = parts.join('\n');

        const messages = [
            ...FEW_SHOT,
            { role: 'user' as const, content: userMsg },
        ];

        const timeout = AbortSignal.timeout(10_000);
        const combined = signal
            ? AbortSignal.any([signal, timeout])
            : timeout;

        try {
            const res = await fetch(`${this.baseUrl}/api/chat`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                signal:  combined,
                body: JSON.stringify({
                    model:    this.model,
                    system:   SYSTEM_PROMPT,
                    messages,
                    stream:   false,
                    format:   OUTPUT_SCHEMA,
                    options:  { temperature: 0, num_predict: 60 },
                }),
            });

            if (!res.ok) {
                throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
            }

            const data = await res.json() as OllamaResponse;
            return JSON.parse(data.message.content.trim());
        } catch (err: unknown) {
            const name = err instanceof Error ? err.name : '';
            if (name === 'AbortError') return null; // intentional cancel by new command
            if (name === 'TimeoutError') {
                vscode.window.setStatusBarMessage('$(warning) PBV: LLM timed out (Ollama took >10 s)', 6000);
            } else {
                vscode.window.setStatusBarMessage(`$(warning) PBV: LLM error — ${err}`, 8000);
            }
            return null;
        }
    }
}

export function windowAroundCursor(content: string, cursorLine: number, radius: number): string {
    const lines = content.split('\n');
    const start = Math.max(0, cursorLine - 1 - radius);
    const end   = Math.min(lines.length, cursorLine + radius);
    return lines.slice(start, end)
        .map((l, i) => `${start + i + 1}: ${l}`)
        .join('\n');
}

// Returns the lines between startLine and endLine (both 1-based, inclusive), prefixed with line numbers.
export function windowForLines(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end   = Math.min(lines.length, endLine);
    return lines.slice(start, end)
        .map((l, i) => `${start + i + 1}: ${l}`)
        .join('\n');
}
