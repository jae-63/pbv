import * as vscode from 'vscode';
import { TEMPLATE_CMDS } from './commandData';

function extensionMtime(): string {
    try {
        // fs is imported later in this file for the panel writer — use require to avoid duplicate
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const t = (require('fs') as typeof import('fs')).statSync(__filename).mtime;
        return t.toISOString().slice(0, 16).replace('T', ' ');
    } catch { return 'unknown'; }
}

// ---------------------------------------------------------------------------
// Command data
// ---------------------------------------------------------------------------

interface Cmd { phrase: string; desc: string; llm?: true }
interface Section { title: string; cmds: Cmd[] }

const UNIVERSAL: Section[] = [
    {
        title: 'Navigation',
        cmds: [
            { phrase: 'line N',                              desc: 'Go to line N (mod-100)' },
            { phrase: 'word N on line M',                    desc: 'Go to Nth token on line M' },
            { phrase: 'go to Nth word on line M',            desc: 'Ordinal: first / second / … / last / penultimate' },
            { phrase: 'jump to [ordinal] [char] on [line]',  desc: '"jump to second tango on 21" — NATO char navigation' },
            { phrase: 'jump to mark',                        desc: 'Navigate to saved mark position' },
            { phrase: 'match paren / match bracket',         desc: 'Jump to matching bracket or brace' },
            { phrase: 'top / bottom',                        desc: 'Start / end of file' },
            { phrase: 'home / end',                          desc: 'Start / end of line' },
            { phrase: 'up N / down N  (or: move up/down N lines)',        desc: 'Move cursor N lines' },
            { phrase: 'cursor right N characters  (or: move right N)',   desc: 'Move N characters right' },
            { phrase: 'cursor left N characters   (or: move left N)',    desc: 'Move N characters left' },
            { phrase: 'cursor left / cursor right',                       desc: 'Move one character (single step)' },
            { phrase: 'page up / page down',                 desc: 'Scroll one page' },
        ],
    },
    {
        title: 'Cache Pad',
        cmds: [
            { phrase: 'recent N  (or: cache N)',             desc: 'Insert identifier from slot N (1–20)' },
            { phrase: 'at sign recent N',                    desc: 'Insert @identifier from slot N' },
            { phrase: 'cache word  (or: cache this / cache that)', desc: 'Push word at cursor (or selection) into slot 1' },
            { phrase: 'cache and assign',                    desc: 'Cache word at cursor then insert  =  (Dragon-era compound)' },
            { phrase: 'empty cache pad  (or: clear cache pad)', desc: 'Empty all slots' },
        ],
    },
    {
        title: 'Transactions',
        cmds: [
            { phrase: 'set mark',           desc: 'Save full restore point (buffer text + cursor)' },
            { phrase: 'undo transaction',   desc: 'Revert to last set mark in one shot' },
            { phrase: 'jump to mark',       desc: 'Navigate to mark without changing the buffer' },
        ],
    },
    {
        title: 'Selection & Editing',
        cmds: [
            { phrase: 'select word  (or: double select)',    desc: 'Select word at cursor' },
            { phrase: 'select all',                          desc: 'Select entire file' },
            { phrase: 'delete word / delete N words',        desc: 'Delete words leftward' },
            { phrase: 'delete line',                         desc: 'Delete current line' },
            { phrase: 'backspace',                            desc: 'Delete previous character' },
            { phrase: 'delete N characters',                  desc: 'Delete N characters left' },
            { phrase: 'delete to end',                       desc: 'Delete to end of line' },
            { phrase: 'copy / cut / paste',                  desc: 'Clipboard operations' },
            { phrase: 'undo / redo',                         desc: 'Standard undo / redo' },
            { phrase: 'comment line',                        desc: 'Toggle line comment' },
        ],
    },
    {
        title: 'Special Characters  (instant, no LLM)',
        cmds: [
            { phrase: 'open bracket / close bracket  (or: left / right bracket)',  desc: '[ ]' },
            { phrase: 'open brace / close brace      (or: left / right brace)',    desc: '{ }' },
            { phrase: 'open paren / close paren      (or: left / right paren)',    desc: '( )' },
            { phrase: 'open angle / close angle',                                  desc: '< >' },
            { phrase: 'backslash  (or: back slash)',  desc: '\\' },
            { phrase: 'caret',                        desc: '^' },
            { phrase: 'ampersand',                    desc: '&' },
            { phrase: 'bang  (or: exclamation mark)', desc: '!' },
            { phrase: 'tilde',                        desc: '~' },
            { phrase: 'semicolon / colon / comma',     desc: '; : ,' },
            { phrase: 'dot  (or: period)',             desc: '.' },
            { phrase: 'colon space',                   desc: ':  (with trailing space — for type annotations: "colon space type str")' },
            { phrase: 'apostrophe  (or: single quote)', desc: "'" },
            { phrase: 'double quote',                 desc: '"  (see also: open string)' },
            { phrase: 'backtick',                     desc: '`' },
            { phrase: 'plus  (or: plus sign)',        desc: '+' },
            { phrase: 'at sign',                      desc: '@' },
            { phrase: 'dollar sign / percent sign',   desc: '$ %' },
            { phrase: 'question mark / forward slash',desc: '? /' },
            { phrase: 'arrow  (or: returns value)',   desc: ' ->  (Python return-type annotation)' },
        ],
    },
    {
        title: 'Text Formatting  (instant, no LLM)',
        cmds: [
            { phrase: 'smash word1 word2 …',   desc: 'Join as lowercase: defaultdict' },
            { phrase: 'camel word1 word2 …',   desc: 'camelCase: defaultDict' },
            { phrase: 'pascal word1 word2 …  (or: hammer …)', desc: 'PascalCase: DefaultDict' },
            { phrase: 'snake word1 word2 …',   desc: 'snake_case: default_dict' },
            { phrase: 'constant word1 word2 …',desc: 'CONSTANT_CASE: DEFAULT_DICT' },
            { phrase: 'kebab word1 word2 …',   desc: 'kebab-case: default-dict' },
            { phrase: 'smash that  (or: camel / snake / pascal / constant / kebab that)', desc: 'Apply format to selected text' },
            { phrase: 'section header [label]',desc: 'Insert # ─── LABEL ─── comment (fills LABEL_TEMPLATE if no label given)' },
            { phrase: 'comment block title',   desc: '# ─────────── / # Title / # ─────────── (fast-path)' },
            { phrase: 'underline',             desc: 'Insert = chars matching length of line above cursor' },
            { phrase: 'underline dashes',      desc: 'Insert - chars matching length of line above cursor' },
            { phrase: 'numeral N  (or: number N)', desc: 'Insert digit(s) literally — avoids Whisper writing "two" instead of 2' },
            { phrase: 'return  (or: enter, new line)', desc: 'Insert newline — prefer "return" at utterance end; Whisper swallows "new line" as punctuation' },
        ],
    },
    {
        title: 'File / Tabs',
        cmds: [
            { phrase: 'save',          desc: 'Save current file' },
            { phrase: 'save as',       desc: 'Save with new name / location' },
            { phrase: 'new file',      desc: 'Open new untitled buffer' },
            { phrase: 'close file',    desc: 'Close active editor (prompts if unsaved)' },
            { phrase: 'next file',     desc: 'Cycle to next open tab' },
            { phrase: 'previous file', desc: 'Cycle to previous open tab' },
            { phrase: 'reopen file',   desc: 'Reopen last closed editor' },
            { phrase: 'format',        desc: 'Format document' },
        ],
    },
    {
        title: 'AI Commands  (via LLM, ~5s)',
        cmds: [
            { phrase: 'select [token name]',          desc: 'camelCase / snake_case aware — resolves spoken form to actual identifier', llm: true },
            { phrase: 'insert [code description]',    desc: 'Generate and insert code at cursor', llm: true },
            { phrase: '[transform]  (with selection)', desc: 'e.g. "convert to snake case", "add error handling", "make async"', llm: true },
        ],
    },
];

const LANG_SECTIONS: Record<string, Section> = {
    python: {
        title: 'Python Templates',
        cmds: [
            // Fast-path templates — derived from commandData.ts (instant, no LLM wait)
            ...TEMPLATE_CMDS
                .filter(tc => tc.lang === 'python')
                .map(tc => ({ phrase: tc.phrase, desc: tc.desc })),
            // Type annotations (instant, no LLM)
            { phrase: 'type str  (or: int / float / bool / none / path / namespace)', desc: 'bare type name — use after "colon space"' },
            { phrase: 'list of str  (or: list of int, list str, …)',  desc: 'list[str]' },
            { phrase: 'list of tuple str int',          desc: 'list[tuple[str, int]]' },
            { phrase: 'dict str int  (or: dict of str to int)',       desc: 'dict[str, int]' },
            { phrase: 'optional path  (or: optional str / int / …)', desc: 'Optional[Path]  etc.' },
            { phrase: 'argparse namespace  (or: argparse dot namespace)', desc: 'argparse.Namespace' },
            { phrase: 'default dict',                   desc: 'defaultdict' },
            // Function name shorthand — inserts "def NAME" and auto-caches the name
            { phrase: 'define function snake my func name  (or: camel / pascal / smash …)', desc: 'def my_func_name — caches name for "recent N" reuse; "define method" works too' },
            // LLM-only (no fast-path equivalent)
            { phrase: 'for each',         desc: 'for item in …:',  llm: true },
            { phrase: 'class definition', desc: 'class Name:',     llm: true },
        ],
    },
    go: {
        title: 'Go Templates',
        cmds: [
            // Fast-path templates — derived from commandData.ts
            ...TEMPLATE_CMDS
                .filter(tc => tc.lang === 'go')
                .map(tc => ({ phrase: tc.phrase, desc: tc.desc })),
            // LLM-only
            { phrase: 'for loop',            desc: 'for i := 0; i < N; i++',  llm: true },
            { phrase: 'if statement',        desc: 'if condition {',            llm: true },
            { phrase: 'if error',            desc: 'if err != nil { return }',  llm: true },
            { phrase: 'function definition', desc: 'func name(…) …',           llm: true },
            { phrase: 'struct definition',   desc: 'type Name struct {',        llm: true },
            { phrase: 'goroutine',           desc: 'go func() { … }()',         llm: true },
            { phrase: 'channel',             desc: 'make(chan Type)',            llm: true },
        ],
    },
    'terraform-hcl': {
        title: 'Terraform Templates  (via LLM)',
        cmds: [
            { phrase: 'resource block',   desc: 'resource "type" "name" {',  llm: true },
            { phrase: 'variable block',   desc: 'variable "name" {',         llm: true },
            { phrase: 'output block',     desc: 'output "name" {',           llm: true },
            { phrase: 'data block',       desc: 'data "type" "name" {',      llm: true },
            { phrase: 'locals block',     desc: 'locals { … }',              llm: true },
            { phrase: 'module block',     desc: 'module "name" {',           llm: true },
        ],
    },
    yaml: {
        title: 'YAML / k8s Templates  (via LLM)',
        cmds: [
            { phrase: 'deployment',   desc: 'k8s Deployment manifest',  llm: true },
            { phrase: 'service',      desc: 'k8s Service manifest',      llm: true },
            { phrase: 'config map',   desc: 'k8s ConfigMap manifest',    llm: true },
            { phrase: 'list item',    desc: '- key: value entry',        llm: true },
        ],
    },
    typescript: {
        title: 'TypeScript Templates  (via LLM)',
        cmds: [
            { phrase: 'function definition', desc: 'function or arrow function', llm: true },
            { phrase: 'interface',           desc: 'interface Name {',           llm: true },
            { phrase: 'async function',      desc: 'async function name()',       llm: true },
            { phrase: 'try catch',           desc: 'try { … } catch (e)',         llm: true },
            { phrase: 'for of loop',         desc: 'for (const x of arr)',        llm: true },
        ],
    },
    javascript: {
        title: 'JavaScript Templates  (via LLM)',
        cmds: [
            { phrase: 'function definition', desc: 'function or arrow function', llm: true },
            { phrase: 'async function',      desc: 'async function name()',       llm: true },
            { phrase: 'try catch',           desc: 'try { … } catch (e)',         llm: true },
            { phrase: 'for of loop',         desc: 'for (const x of arr)',        llm: true },
        ],
    },
};

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function renderSection(s: Section): string {
    const rows = s.cmds.map(c => `
      <tr class="${c.llm ? 'llm' : ''}">
        <td class="phrase"><code>${esc(c.phrase)}</code></td>
        <td class="desc">${esc(c.desc)}${c.llm ? ' <span class="badge">LLM</span>' : ''}</td>
      </tr>`).join('');
    return `
    <section>
      <h2>${esc(s.title)}</h2>
      <table><tbody>${rows}</tbody></table>
    </section>`;
}

function esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildHtml(lang: string): string {
    const langSection = LANG_SECTIONS[lang];
    const sections = langSection
        ? [langSection, ...UNIVERSAL]
        : UNIVERSAL;

    const langLabel = lang ? ` — ${lang}` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PBV Commands${langLabel}</title>
<style>
  body { font-family: var(--vscode-font-family, -apple-system, sans-serif);
         font-size: 13px; color: var(--vscode-foreground, #ccc);
         background: var(--vscode-editor-background, #1e1e1e);
         margin: 0; padding: 16px 24px; }
  h1   { font-size: 16px; font-weight: 600; margin: 0 0 20px;
         border-bottom: 1px solid var(--vscode-panel-border, #444);
         padding-bottom: 8px; }
  h2   { font-size: 12px; font-weight: 700; letter-spacing: .06em;
         text-transform: uppercase; color: var(--vscode-textLink-foreground, #4ec9b0);
         margin: 20px 0 6px; }
  section { margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; }
  tr    { border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a); }
  tr:last-child { border-bottom: none; }
  tr.llm td.phrase code { color: var(--vscode-editorWarning-foreground, #cca700); }
  td    { padding: 4px 8px 4px 0; vertical-align: top; }
  td.phrase { width: 42%; white-space: nowrap; }
  td.desc   { color: var(--vscode-descriptionForeground, #999); }
  code  { font-family: var(--vscode-editor-font-family, monospace);
          font-size: 12px; color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }
  .badge { display: inline-block; font-size: 9px; padding: 1px 4px;
           background: var(--vscode-badge-background, #4d4d4d);
           color: var(--vscode-badge-foreground, #fff);
           border-radius: 3px; vertical-align: middle; margin-left: 4px; }
  #filter { width: 100%; box-sizing: border-box; padding: 5px 8px;
            margin-bottom: 16px; font-size: 12px;
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px; outline: none; }
  tr.hidden { display: none; }
</style>
</head>
<body>
<h1>PBV Commands${langLabel ? ` <small style="font-weight:400;color:#888">${esc(langLabel.slice(3))}</small>` : ''} <small style="font-weight:400;font-size:10px;color:#555;font-family:monospace">${extensionMtime()}</small></h1>
<input id="filter" type="text" placeholder="Filter commands…" autofocus>
${sections.map(renderSection).join('\n')}
<script>
  const inp = document.getElementById('filter');
  inp.addEventListener('input', () => {
    const q = inp.value.toLowerCase();
    document.querySelectorAll('tr').forEach(tr => {
      tr.classList.toggle('hidden', q.length > 0 &&
        !tr.textContent.toLowerCase().includes(q));
    });
  });
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API — opens in the system browser so it stays visible on a second
// monitor while coding, requires no keyboard/mouse to dismiss, and works for
// users who cannot use VSCode UI interactions at all.
// ---------------------------------------------------------------------------

import * as fs            from 'fs';
import * as os            from 'os';
import * as path          from 'path';
import { execFile }       from 'child_process';

export function showCommandsPanel(_context: vscode.ExtensionContext): void {
    const lang    = vscode.window.activeTextEditor?.document.languageId ?? '';
    const html    = buildHtml(lang);
    const tmpFile = path.join(os.tmpdir(), 'pbv-commands.html');
    fs.writeFileSync(tmpFile, html, 'utf8');

    const browserApp = vscode.workspace.getConfiguration('pbv').get<string>('helpBrowser', '').trim();
    if (browserApp) {
        execFile('open', ['-a', browserApp, tmpFile]);
    } else {
        vscode.env.openExternal(vscode.Uri.file(tmpFile));
    }
}
