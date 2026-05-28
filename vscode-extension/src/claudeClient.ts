import * as vscode from 'vscode';

const SYSTEM_PROMPT = 'You are a voice coding assistant. Map each utterance to exactly one JSON command object. If a "Selected code:" block is present, the utterance is a transformation request — return replaceSelection with the transformed code.';

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
    // camelCase / snake_case aware selection — resolve spoken form to actual token
    { role: 'user',      content: 'Utterance: "select my variable name"\nLanguage: python\nContent excerpt: result = myVariableName + offset' },
    { role: 'assistant', content: '{"cmd":"selectToken","token":"myVariableName"}' },
    { role: 'user',      content: 'Utterance: "select output file name"\nLanguage: python\nContent excerpt: open(output_file_name, "r")' },
    { role: 'assistant', content: '{"cmd":"selectToken","token":"output_file_name"}' },
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
                'selectToken', 'insertCacheItem',
                'deleteChars', 'deleteWords', 'deleteLine', 'deleteToEndOfLine',
                'setMark', 'undoTransaction',
                'undo', 'redo', 'save', 'formatDocument',
                'toggleLineComment', 'selectAll', 'copy', 'cut', 'paste',
            ],
        },
        line:  { type: 'number' },
        word:  { type: 'number' },
        text:  { type: 'string' },
        token: { type: 'string' },
        n:     { type: 'number' },
        index: { type: 'number' },
    },
    required: ['cmd'],
};

export interface EditorSnapshot {
    fileName:     string;
    language:     string;
    content:      string;
    cursorLine:   number;   // 1-based
    cursorChar:   number;   // 1-based
    selectedText: string;
    cachePad:     string[];
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
        const parts = [
            `Language: ${snap.language}`,
            `Cursor: line ${snap.cursorLine}, char ${snap.cursorChar}`,
            `Cache pad: ${snap.cachePad.length ? snap.cachePad.join(', ') : '(empty)'}`,
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
                vscode.window.showWarningMessage('Voice Coder: LLM timed out (Ollama took >10 s)');
            } else {
                vscode.window.showWarningMessage(`Voice Coder: LLM error — ${err}`);
            }
            return null;
        }
    }
}

function windowAroundCursor(content: string, cursorLine: number, radius: number): string {
    const lines = content.split('\n');
    const start = Math.max(0, cursorLine - 1 - radius);
    const end   = Math.min(lines.length, cursorLine + radius);
    return lines.slice(start, end)
        .map((l, i) => `${start + i + 1}: ${l}`)
        .join('\n');
}
