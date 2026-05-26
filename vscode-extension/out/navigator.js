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
exports.gotoLine = gotoLine;
exports.gotoWordOnLine = gotoWordOnLine;
exports.selectToken = selectToken;
const vscode = __importStar(require("vscode"));
// Resolve a mod-100 line number to the nearest actual line (0-based internally).
// User says "go to line 34"; we find the line closest to the cursor where (lineNo % 100 === 34 % 100).
function resolveModLine(targetMod, editor) {
    const current = editor.selection.active.line; // 0-based
    const count = editor.document.lineCount;
    const mod = ((targetMod % 100) + 100) % 100; // normalise
    let bestLine = -1;
    let bestDist = Infinity;
    for (let l = 0; l < count; l++) {
        if ((l + 1) % 100 === mod) { // l+1 = 1-based display number
            const dist = Math.abs(l - current);
            if (dist < bestDist) {
                bestDist = dist;
                bestLine = l;
            }
        }
    }
    return bestLine >= 0 ? bestLine : null;
}
async function gotoLine(targetMod) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const line = resolveModLine(targetMod, editor);
    if (line === null)
        return;
    const pos = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}
// Tokenise a line into runs of non-whitespace, returning their start columns.
function tokenise(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        if (/\S/.test(text[i])) {
            const start = i;
            while (i < text.length && /\S/.test(text[i]))
                i++;
            tokens.push({ start, end: i });
        }
        else {
            i++;
        }
    }
    return tokens;
}
// wordIndex is 1-based (user says "word three" or "third word" → 3).
// line is the mod-100 target.
async function gotoWordOnLine(wordIndex, targetMod) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const line = resolveModLine(targetMod, editor);
    if (line === null)
        return;
    const lineText = editor.document.lineAt(line).text;
    const tokens = tokenise(lineText);
    const idx = wordIndex - 1; // 0-based
    if (idx < 0 || idx >= tokens.length)
        return;
    const pos = new vscode.Position(line, tokens[idx].start);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}
// Find the first occurrence of `token` in the current document at or after the cursor
// and select it. Wraps to top of file if not found below cursor.
async function selectToken(token) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const doc = editor.document;
    const text = doc.getText();
    const cursor = doc.offsetAt(editor.selection.active);
    // Search forward from cursor, then wrap
    const searchFrom = (startOffset) => {
        const idx = text.indexOf(token, startOffset);
        return idx;
    };
    let found = searchFrom(cursor);
    if (found === -1)
        found = searchFrom(0); // wrap
    if (found === -1)
        return;
    const startPos = doc.positionAt(found);
    const endPos = doc.positionAt(found + token.length);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
}
//# sourceMappingURL=navigator.js.map