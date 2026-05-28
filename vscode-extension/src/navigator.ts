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

// Jump to the first or last occurrence of a single character on a target line.
// `char` is a literal character (e.g. '_', '@', 't'). Uses the same mod-100
// line resolution as gotoLine.
export async function jumpToCharOnLine(
    which: 'first' | 'last',
    char: string,
    targetMod: number,
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // targetMod === -1 means current line
    const line = targetMod === -1
        ? editor.selection.active.line
        : resolveModLine(targetMod, editor);
    if (line === null) return;

    const text = editor.document.lineAt(line).text;
    const col  = which === 'first' ? text.indexOf(char) : text.lastIndexOf(char);
    if (col === -1) return;

    const pos = new vscode.Position(line, col);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

// Find the first occurrence of `token` in the current document at or after the cursor
// and select it. Wraps to top of file if not found below cursor.
export async function selectToken(token: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc    = editor.document;
    const text   = doc.getText();
    const cursor = doc.offsetAt(editor.selection.active);

    // Search forward from cursor, then wrap
    const searchFrom = (startOffset: number): number => {
        const idx = text.indexOf(token, startOffset);
        return idx;
    };

    let found = searchFrom(cursor);
    if (found === -1) found = searchFrom(0); // wrap
    if (found === -1) return;

    const startPos = doc.positionAt(found);
    const endPos   = doc.positionAt(found + token.length);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
}
