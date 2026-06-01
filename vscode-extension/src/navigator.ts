import * as vscode from 'vscode';

// Resolve a mod-100 line number to the nearest actual line (0-based internally).
// User says "go to line 34"; we find the line closest to the cursor where (lineNo % 100 === 34 % 100).
function resolveModLine(targetMod: number, editor: vscode.TextEditor): number | null {
    const current = editor.selection.active.line; // 0-based
    const count   = editor.document.lineCount;
    const mod     = ((targetMod % 100) + 100) % 100; // normalise

    let bestLine = -1;
    let bestDist = Infinity;
    for (let l = 0; l < count; l++) {
        if ((l + 1) % 100 === mod) {           // l+1 = 1-based display number
            const dist = Math.abs(l - current);
            if (dist < bestDist) { bestDist = dist; bestLine = l; }
        }
    }
    return bestLine >= 0 ? bestLine : null;
}

export async function gotoLine(targetMod: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const line = resolveModLine(targetMod, editor);
    if (line === null) return;

    const pos = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

// Tokenise a line into runs of non-whitespace, returning their start columns.
function tokenise(text: string): { start: number; end: number }[] {
    const tokens: { start: number; end: number }[] = [];
    let i = 0;
    while (i < text.length) {
        if (/\S/.test(text[i])) {
            const start = i;
            while (i < text.length && /\S/.test(text[i])) i++;
            tokens.push({ start, end: i });
        } else {
            i++;
        }
    }
    return tokens;
}

// wordIndex is 1-based (user says "word three" or "third word" → 3).
// line is the mod-100 target.
export async function gotoWordOnLine(wordIndex: number, targetMod: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const line = resolveModLine(targetMod, editor);
    if (line === null) return;

    const lineText = editor.document.lineAt(line).text;
    const tokens   = tokenise(lineText);
    const idx      = wordIndex - 1; // 0-based

    if (idx < 0 || idx >= tokens.length) return;

    const pos = new vscode.Position(line, tokens[idx].start);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

// Jump to the Nth occurrence of a character on a target line.
// `ordinal` is 1-based (1=first, 2=second, …) or negative (-1=last, -2=penultimate, …).
// `targetMod` is the mod-100 line number, or a special value:
//   -100 = current line,  -101 = next line,  -102 = previous line
export async function jumpToCharOnLine(
    ordinal: number,
    char: string,
    targetMod: number,
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let line: number | null;
    if      (targetMod === -100) line = editor.selection.active.line;
    else if (targetMod === -101) line = editor.selection.active.line + 1;
    else if (targetMod === -102) line = editor.selection.active.line - 1;
    else                         line = resolveModLine(targetMod, editor);
    if (line === null || line < 0 || line >= editor.document.lineCount) return;

    // Case-insensitive: NATO 'd' (delta) must match 'D' in ALL_CAPS identifiers.
    const text  = editor.document.lineAt(line).text.toLowerCase();
    const query = char.toLowerCase();

    // Collect all occurrence indices.
    const positions: number[] = [];
    let idx = text.indexOf(query);
    while (idx !== -1) { positions.push(idx); idx = text.indexOf(query, idx + 1); }
    if (positions.length === 0) return;

    // Resolve ordinal: 1=first, -1=last, -2=penultimate, etc.
    let col: number;
    if (ordinal > 0) {
        col = positions[Math.min(ordinal - 1, positions.length - 1)];
    } else {
        col = positions[Math.max(positions.length + ordinal, 0)];
    }

    const pos = new vscode.Position(line, col);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

// ---------------------------------------------------------------------------
// Pure search helpers — exported for unit tests, no VSCode dependency.
// ---------------------------------------------------------------------------

// Returns all identifier forms for a spoken phrase, e.g. "triage completed" →
// ["triage completed", "triage_completed", "triageCompleted", "TriageCompleted", …].
// Single-word tokens return [token] unchanged.
export function candidateForms(token: string): string[] {
    const words = token.trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) return [token];
    const lower    = words.map(w => w.toLowerCase());
    const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return [
        token,                                              // literal as spoken
        lower.join('_'),                                    // snake_case
        lower[0] + lower.slice(1).map(capFirst).join(''),  // camelCase
        lower.map(capFirst).join(''),                       // PascalCase
        lower.map(w => w.toUpperCase()).join('_'),          // CONSTANT_CASE
        lower.join('-'),                                    // kebab-case
        lower.join(''),                                     // smashcase
    ];
}

// Returns the offset and match length of `token` in `text` (case-insensitive),
// trying all identifier forms of the token. Searches forward from `cursor` and
// wraps. Returns null if not found.
export function findTokenOffset(
    text: string,
    token: string,
    cursor: number,
): { offset: number; matchLength: number } | null {
    const lower = text.toLowerCase();
    for (const candidate of candidateForms(token)) {
        const query = candidate.toLowerCase();
        let offset = lower.indexOf(query, cursor);
        if (offset === -1) offset = lower.indexOf(query, 0);
        if (offset !== -1) return { offset, matchLength: candidate.length };
    }
    return null;
}

// Returns {start, end} offsets (end is exclusive) for the range from startToken
// to the end of endToken (case-insensitive, tries all identifier forms for each).
// Wraps on startToken. Returns null if either token is missing or endToken doesn't
// follow startToken.
export function findRangeOffsets(
    text: string,
    startToken: string,
    endToken: string,
    cursor: number,
): { start: number; end: number } | null {
    const startResult = findTokenOffset(text, startToken, cursor);
    if (!startResult) return null;

    const lower = text.toLowerCase();
    for (const candidate of candidateForms(endToken)) {
        const endQ   = candidate.toLowerCase();
        const endIdx = lower.indexOf(endQ, startResult.offset + startResult.matchLength);
        if (endIdx !== -1) return { start: startResult.offset, end: endIdx + candidate.length };
    }
    return null;
}

// ---------------------------------------------------------------------------
// VSCode commands — thin wrappers over the pure helpers above.
// ---------------------------------------------------------------------------

// Find startToken then endToken (must follow startToken) and select everything between them.
// Searches forward from cursor, case-insensitively; wraps on startToken only.
export async function selectRange(startToken: string, endToken: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc    = editor.document;
    const text   = doc.getText();
    const cursor = doc.offsetAt(editor.selection.active);
    const range  = findRangeOffsets(text, startToken, endToken, cursor);
    if (!range) return;

    const startPos = doc.positionAt(range.start);
    const endPos   = doc.positionAt(range.end);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
}

// Find the first occurrence of `token` in the current document at or after the cursor
// and select it. Wraps to top of file if not found below cursor.
export async function selectToken(token: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc    = editor.document;
    const text   = doc.getText();
    const cursor = doc.offsetAt(editor.selection.active);
    const found  = findTokenOffset(text, token, cursor);
    if (!found) return;

    const startPos = doc.positionAt(found.offset);
    const endPos   = doc.positionAt(found.offset + found.matchLength);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
}
