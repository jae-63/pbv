import { TEMPLATE_CMDS } from './commandData';

// Fast regex-based command matching — runs in <1ms, no LLM needed.
//
// fastInterpret(text)      — single command, exact match (backward compat)
// fastInterpretMulti(text) — greedy left-to-right: returns all fast-path
//   commands found at the start of the text, plus any unmatched remainder
//   that should be sent to the LLM.
//
// Dragon-style continuous speech: "go to line 32 delete word set mark"
// → [{gotoLine:32}, {deleteWords:1}, {setMark}], remainder=""

type Command = Record<string, unknown>;

interface Rule {
    exact:  RegExp;   // anchored ^ … $ — for single-command exact match
    prefix: RegExp;   // anchored ^, no $ — for greedy prefix match
    build:  (m: RegExpMatchArray) => Command;
}

const n = (s: string) => parseInt(s, 10);

// Build a Rule from a pattern source string (no ^ or $ — those are added here).
function rule(src: string, build: (m: RegExpMatchArray) => Command): Rule {
    return {
        exact:  new RegExp('^(?:' + src + ')$', 'i'),
        prefix: new RegExp('^(?:' + src + ')(?=\\s|$)', 'i'),
        build,
    };
}

// Character names for "press X N times" — keys must be lowercase, no spaces.
const PRESS_CHARS: Record<string, string> = {
    equal: '=',  equals: '=',
    dash: '-',   dashes: '-',  hyphen: '-',
    hash: '#',   hashes: '#',  pound: '#',
    star: '*',   stars: '*',   asterisk: '*',
    underscore: '_',  underscores: '_',
    tilde: '~',  tildes: '~',
    dot: '.',    dots: '.',    period: '.',
    pipe: '|',   pipes: '|',
    slash: '/',  slashes: '/',
    backtick: '`', backticks: '`',
    space: ' ',  spaces: ' ',
};

const RULES: Rule[] = [
    // Navigation — word on line (before bare "line N")
    rule('(?:go\\s+to\\s+)?word\\s+(\\d+)\\s+(?:on\\s+)?line\\s+(\\d+)',
         m => ({ cmd: 'gotoWordOnLine', word: n(m[1]), line: n(m[2]) })),
    rule('(?:go\\s+to\\s+)?(\\d+)(?:st|nd|rd|th)\\s+word\\s+(?:on\\s+)?line\\s+(\\d+)',
         m => ({ cmd: 'gotoWordOnLine', word: n(m[1]), line: n(m[2]) })),

    // Navigation — line
    rule('(?:go\\s+to\\s+|goto\\s+|jump\\s+to\\s+)?line\\s+(\\d+)',
         m => ({ cmd: 'gotoLine', line: n(m[1]) })),

    // Navigation — cursor up/down
    rule('(?:cursor\\s+)?up\\s+(\\d+)(?:\\s+lines?)?',
         m => ({ cmd: 'cursorUp', n: n(m[1]) })),
    rule('(?:cursor\\s+)?up',
         _  => ({ cmd: 'cursorUp', n: 1 })),
    rule('(?:cursor\\s+)?down\\s+(\\d+)(?:\\s+lines?)?',
         m => ({ cmd: 'cursorDown', n: n(m[1]) })),
    rule('(?:cursor\\s+)?down',
         _  => ({ cmd: 'cursorDown', n: 1 })),

    // Navigation — cursor movement
    rule('(?:cursor\\s+)?home', _ => ({ cmd: 'cursorHome' })),
    rule('(?:cursor\\s+)?end(?:\\s+of\\s+line)?', _ => ({ cmd: 'cursorEnd' })),
    rule('(?:(?:cursor|go)\\s+to\\s+)?top',    _ => ({ cmd: 'cursorTop' })),
    rule('(?:(?:cursor|go)\\s+to\\s+)?bottom', _ => ({ cmd: 'cursorBottom' })),
    // Cache pad — retrieval
    rule('cache\\s+(\\d+)',
         m => ({ cmd: 'insertCacheItem', index: n(m[1]) })),
    rule('insert\\s+cache(?:\\s+item)?\\s+(\\d+)',
         m => ({ cmd: 'insertCacheItem', index: n(m[1]) })),
    // "recent N" — Dragon-era vocabulary for bare cache insertion
    rule('recent\\s+(\\d+)',
         m => ({ cmd: 'insertCacheItem', index: n(m[1]) })),
    // "at sign recent N" — insert @identifier (Perl arrays, Python decorators, etc.)
    rule('at\\s+sign\\s+recent\\s+(\\d+)',
         m => ({ cmd: 'insertCacheItem', index: n(m[1]), prefix: '@' })),

    // NATO phonetic navigation — full ordinal range + current/next/previous line
    // "jump to third tango on 21"  "jump to last underscore on current line"
    // "jump to second sierra on next line"
    rule('jump\\s+to\\s+(first|second|third|fourth|fifth|sixth|last|penultimate)\\s+(.+?)\\s+on\\s+(?:(current|next|prev(?:ious)?)\\s+line|(\\d+))',
         m => ({
             cmd:     'jumpToCharOnLine',
             ordinal: ordinalToN(m[1]),
             char:    natoToChar(m[2]),
             line:    lineRef(m[3], m[4]),
         })),

    // Deletion
    rule('delete\\s+(?:this\\s+)?line',         _ => ({ cmd: 'deleteLine' })),
    rule('delete\\s+(\\d+)\\s+words?',          m => ({ cmd: 'deleteWords', n: n(m[1]) })),
    rule('delete\\s+(?:a\\s+)?word',            _ => ({ cmd: 'deleteWords', n: 1 })),
    rule('delete\\s+(\\d+)\\s+chars?(?:acters?)?', m => ({ cmd: 'deleteChars', n: n(m[1]) })),
    rule('delete\\s+(?:to\\s+)?end(?:\\s+of\\s+(?:the\\s+)?line)?',
         _ => ({ cmd: 'deleteToEndOfLine' })),

    // Text-insertion templates — derived from TEMPLATE_CMDS in commandData.ts.
    // Add new templates there; no change here needed.
    ...TEMPLATE_CMDS.map(tc => {
        const src = tc.pattern ?? tc.phrase.replace(/\s+/g, '\\s+');
        return rule(src, _ => ({ cmd: 'insertText', text: tc.text }));
    }),

    // Dictation helpers
    rule('new\\s+line',    _ => ({ cmd: 'insertText', text: '\n' })),
    // "letter romeo" → 'r',  chainable: "letter romeo letter echo" → two insertions → 're'
    rule('letter\\s+([a-z][a-z-]*)', m => ({ cmd: 'insertText', text: natoToChar(m[1]) })),
    rule('no\\s+space',    _ => ({ cmd: 'deleteChars', n: 1 })),
    rule('open\\s+string', _ => ({ cmd: 'insertText', text: '"' })),
    rule('close\\s+string',_ => ({ cmd: 'closeString' })),

    // Template placeholder navigation — "select title template" → selects TITLE_TEMPLATE
    // Covers all ALL_CAPS_TEMPLATE names without LLM; works for any template word.
    rule('select\\s+(\\w+(?:\\s+\\w+)*)\\s+template',
        m => ({ cmd: 'selectToken', token: m[1].trim().replace(/\s+/g, '_').toUpperCase() + '_TEMPLATE' })),

    // Import statements — never need the LLM; go straight to dictateText so
    // normalizeDictation handles letter contractions ("letter romeo" → 'r' etc.)
    // "from pathlib import Path" → inserts that line + newline
    // "import letter romeo letter echo" → "import re\n"
    rule('from\\s+(\\S+)\\s+import\\s+(.+)',
        m => ({ cmd: 'dictateText', text: `from ${m[1]} import ${m[2]}` })),
    // Non-greedy: stop at "new line" or a following "import" so multi-import
    // utterances ("import argparse new line import re") dispatch as separate commands.
    rule('import\\s+(.+?)(?=\\s+(?:new\\s*line\\b|import\\s+)|$)',
        m => ({ cmd: 'dictateText', text: `import ${m[1]}` })),

    // Dictate — replace selection (or insert at cursor) without LLM.
    // "dictate Word Frequency Counter" → inserts/replaces with exactly those words.
    // Dragon-style "Select and Say": select a placeholder, say "dictate <title>".
    // "dict" is a common Whisper mishearing of "dictate" — alias it here.
    rule('(?:dictate|dict)\\s+(.+)', m => ({ cmd: 'dictateText', text: m[1] })),

    // UI — voice-only access to help and cache pad
    // "show commands" handled by canonical; keep human aliases
    rule('what\\s+can\\s+I\\s+say', _ => ({ cmd: 'showCommands' })),
    rule('help',                    _ => ({ cmd: 'showCommands' })),
    rule('show\\s+cache(?:\\s+pad)?', _ => ({ cmd: 'showCachePad' })),

    // Navigation bookmark — survives buffer edits; auto-set on traversal entry.
    // "set bookmark" / "jump to bookmark" to distinguish from transaction mark.
    rule('set\\s+bookmark',         _ => ({ cmd: 'setNavMark' })),
    rule('jump\\s+to\\s+bookmark',  _ => ({ cmd: 'jumpToNavMark' })),
    rule('jump\\s+back',            _ => ({ cmd: 'jumpToNavMark' })),

    // Accept inline completion (Tab / acceptSelectedSuggestion)
    rule('accept(?:\\s+(?:completion|suggestion))?', _ => ({ cmd: 'acceptCompletion' })),

    // Cache selection
    rule('cache\\s+(?:this|that|selection)', _ => ({ cmd: 'cacheSelection' })),

    // Word selection & bracket matching
    rule('double\\s+select',   _ => ({ cmd: 'selectWord' })),
    rule('match\\s+(?:this\\s+)?paren(?:thesis)?|match\\s+bracket',
         _ => ({ cmd: 'matchParen' })),

    // Repeat-character insertion — "press equals 22 times", "press dash 40 times"
    // Unambiguous phrasing avoids clashing with dictated code like "equals 22".
    rule('(?:press|type)\\s+(' + Object.keys(PRESS_CHARS).join('|') + ')\\s+(\\d+)(?:\\s+times?)?',
        m => ({ cmd: 'insertText', text: (PRESS_CHARS[m[1].toLowerCase()] ?? '').repeat(n(m[2])) })),

    // Underline — inserts chars matching the length of the line above the cursor
    rule('underline(?:\\s+dashes?)?', m => ({ cmd: 'underlineLine', char: /dash/i.test(m[0]) ? '-' : '=' })),

    // Document ops — specific multi-word forms must precede their shorter prefixes
    // ("save as" must beat the "save" prefix; "undo transaction" must beat "undo")
    rule('save\\s+as', _ => ({ cmd: 'saveAs' })),
    rule('save(?:\\s+(?:the\\s+)?(?:file|document))?', _ => ({ cmd: 'save' })),
    rule('(?:revert|undo)\\s+(\\d+)\\s+transactions?',
        m => ({ cmd: 'revertTransactions', n: n(m[1]) })),
    rule('undo\\s+transaction', _ => ({ cmd: 'undoTransaction' })),
    rule('undo(?:\\s+that)?', _ => ({ cmd: 'undo' })),
    rule('format(?:\\s+(?:the\\s+)?(?:file|document))?', _ => ({ cmd: 'formatDocument' })),
    rule('(?:toggle\\s+)?comment(?:\\s+line)?', _ => ({ cmd: 'toggleLineComment' })),
];

// ---------------------------------------------------------------------------
// NATO phonetic alphabet + named punctuation → single character
// ---------------------------------------------------------------------------

const NATO: Record<string, string> = {
    alpha:'a', bravo:'b', charlie:'c', delta:'d', echo:'e', foxtrot:'f',
    golf:'g', hotel:'h', india:'i', juliet:'j', juliett:'j', kilo:'k', lima:'l',
    mike:'m', november:'n', oscar:'o', papa:'p', quebec:'q', romeo:'r',
    sierra:'s', tango:'t', uniform:'u', victor:'v', whiskey:'w',
    'x-ray':'x', xray:'x', yankee:'y', zulu:'z',
    // Named punctuation
    underscore:'_', 'at sign':'@', at:'@', 'percent sign':'%',
    asterisk:'*', 'dollar sign':'$', 'equals sign':'=', 'equal sign':'=',
    'open paren':'(', 'close paren':')', 'left paren':'(', 'right paren':')',
    'open bracket':'[', 'close bracket':']',
    'open brace':'{', 'close brace':'}',
    semicolon:';', colon:':', comma:',', period:'.', slash:'/',
    backslash:'\\', 'exclamation mark':'!', 'question mark':'?',
    'less than':'<', 'greater than':'>', dash:'-', hyphen:'-',
};

export function natoToChar(word: string): string {
    const key = word.trim().toLowerCase();
    return NATO[key] ?? key[0] ?? '';
}

export const NATO_WORDS = new Set(Object.keys(NATO).filter(k => k.length > 1 && /^[a-z-]+$/.test(k)));

// Ordinal word → signed integer (1=first, -1=last, -2=penultimate, etc.)
const ORDINAL_MAP: Record<string, number> = {
    first:1, second:2, third:3, fourth:4, fifth:5, sixth:6,
    last:-1, penultimate:-2,
};

function ordinalToN(word: string): number {
    return ORDINAL_MAP[word.toLowerCase()] ?? 1;
}

// Line reference → special constant or number for mod-100 resolution.
// -100 = current, -101 = next, -102 = previous
function lineRef(word: string | undefined, absNum: string | undefined): number {
    if (!word && absNum) return n(absNum);
    const w = (word ?? '').toLowerCase();
    if (w === 'current') return -100;
    if (w === 'next')    return -101;
    if (w === 'previous' || w === 'prev') return -102;
    return absNum ? n(absNum) : -100;
}

// ---------------------------------------------------------------------------
// Number normalisation
// ---------------------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
    zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
    ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
    sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20,
    thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
};

// Ordinal words → digit+suffix  ("fourth" → "4th", "twenty-first" → "21st")
const ORDINAL_WORDS: Record<string, string> = {
    first:'1st', second:'2nd', third:'3rd', fourth:'4th', fifth:'5th',
    sixth:'6th', seventh:'7th', eighth:'8th', ninth:'9th', tenth:'10th',
    eleventh:'11th', twelfth:'12th', thirteenth:'13th', fourteenth:'14th',
    fifteenth:'15th', sixteenth:'16th', seventeenth:'17th', eighteenth:'18th',
    nineteenth:'19th', twentieth:'20th',
};

function normalizeNumbers(text: string): string {
    // Ordinal words → digit+suffix first
    let t = text.replace(
        /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\b/gi,
        w => ORDINAL_WORDS[w.toLowerCase()] ?? w,
    );
    // Tens+ones compounds ("twenty five" → "25")
    t = t.replace(
        /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi,
        (_, tens, ones) => String((WORD_NUMBERS[tens.toLowerCase()] ?? 0) + (WORD_NUMBERS[ones.toLowerCase()] ?? 0)),
    );
    // Single number words
    t = t.replace(
        /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
        w => String(WORD_NUMBERS[w.toLowerCase()] ?? w),
    );
    return t;
}

function prepare(utterance: string): string {
    // Strip leading AND trailing punctuation/whitespace that Whisper sometimes adds.
    const stripped = utterance.trim().replace(/^[.…,!?\s]+/, '').replace(/[.…,!?]+$/, '');
    // Strip Whisper's mid-sentence auto-periods ("argparse. New line." → "argparse New line")
    // so multi-command sequences remain parseable by the prefix-lookahead rules.
    // Also flatten embedded newlines — Whisper sometimes inserts literal \n between
    // sentences which breaks regex rules that don't match across line boundaries.
    const deperioded = stripped.replace(/\.(\s+)/g, '$1').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
    return normalizeNumbers(deperioded);
}

// ---------------------------------------------------------------------------
// Single-command exact match (backward compat)
// ---------------------------------------------------------------------------

export function fastInterpret(utterance: string): Command | null {
    const text = prepare(utterance);
    for (const { exact, build } of RULES) {
        const m = text.match(exact);
        if (m) return build(m);
    }
    return applyFormatter(text) ?? applyCommentBlock(text) ?? applyCanonical(text) ?? null;
}

// ---------------------------------------------------------------------------
// Talon-style formatters
// ---------------------------------------------------------------------------

const FORMATTERS: Record<string, (tokens: string[]) => string> = {
    snake:    ts => ts.map(t => t.toLowerCase()).join('_'),
    camel:    ts => ts[0].toLowerCase() + ts.slice(1).map(capFirst).join(''),
    hammer:   ts => ts.map(capFirst).join(''),       // PascalCase
    pascal:   ts => ts.map(capFirst).join(''),
    constant: ts => ts.map(t => t.toUpperCase()).join('_'),
    smash:    ts => ts.map(t => t.toLowerCase()).join(''),
    kebab:    ts => ts.map(t => t.toLowerCase()).join('-'),
    dotted:   ts => ts.map(t => t.toLowerCase()).join('.'),
    packed:   ts => ts.map(t => t.toLowerCase()).join('::'),
    slasher:  ts => '/' + ts.map(t => t.toLowerCase()).join('/'),
};

const FORMATTER_PATTERN = new RegExp(
    '^(' + Object.keys(FORMATTERS).join('|') + ')\\s+(.+)$', 'i'
);

function capFirst(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function applyFormatter(utterance: string): Command | null {
    const m = utterance.match(FORMATTER_PATTERN);
    if (!m) return null;
    const fn = FORMATTERS[m[1].toLowerCase()];
    if (!fn) return null;
    const tokens = m[2].trim().split(/\s+/);
    return { cmd: 'insertText', text: fn(tokens) };
}

// ---------------------------------------------------------------------------
// Comment-block templates
// ---------------------------------------------------------------------------

const COMMENT_RULE = /^comment\s+(?:(template)|(block)\s+(.+))$/i;
const DASHES = '# ' + '-'.repeat(75);

function applyCommentBlock(utterance: string): Command | null {
    const m = utterance.match(COMMENT_RULE);
    if (!m) return null;
    const title = m[1] ? 'TEMPLATE' : m[3].charAt(0).toUpperCase() + m[3].slice(1);
    return { cmd: 'insertText', text: `${DASHES}\n# ${title}\n${DASHES}\n\n` };
}

// ---------------------------------------------------------------------------
// Canonical no-argument command matching
// ---------------------------------------------------------------------------
// camelCase name and spoken words share a smashed lowercase form:
//   clearCachePad → "clear cache pad" → matches spoken "clear cache pad"
// Adding a command here makes it speakable with no further fast-path work.

const NO_ARG_COMMANDS = [
    // Cache pad
    'clearCachePad', 'showCachePad', 'refreshCachePad',
    // Modes
    'commandMode', 'dictationMode',
    // Transaction mark
    'setMark', 'undoTransaction', 'jumpToMark',
    // Nav bookmark
    'setNavMark', 'jumpToNavMark',
    // No-arg cursor
    'cursorLeft', 'cursorRight',
    'cursorHome', 'cursorEnd', 'cursorTop', 'cursorBottom',
    'pageUp', 'pageDown',
    // Editing
    'deleteLine', 'deleteToEndOfLine',
    'selectAll', 'selectWord', 'matchParen',
    // Clipboard / history
    'copy', 'cut', 'paste', 'undo', 'redo',
    // File / tabs
    'newFile', 'saveAs', 'closeFile', 'nextFile', 'previousFile', 'reopenFile',
    // Document
    'save', 'formatDocument', 'toggleLineComment',
    // Misc
    'cacheSelection', 'acceptCompletion', 'showCommands',
    // Scroll / traversal
    'enterScrollMode', 'exitScrollMode', 'enterTraversalMode',
];

// Strip everything but lowercase letters — "Clear cachepad" → "clearcachepad"
function smash(s: string): string {
    return s.toLowerCase().replace(/[^a-z]/g, '');
}

// Build lookup: smashed camelCase name → command
// "clearCachePad" → split → "clear cache pad" → smash → "clearcachepad"
const CANONICAL_MAP = new Map<string, string>(
    NO_ARG_COMMANDS.map(cmd => [smash(cmd.replace(/([A-Z])/g, ' $1')), cmd])
);

function applyCanonical(text: string): Command | null {
    const cmd = CANONICAL_MAP.get(smash(text));
    return cmd ? { cmd } : null;
}

// Accumulate smashed words left-to-right; keep the longest prefix that matches
// a command so "undo transaction" beats bare "undo" in a compound utterance.
function applyCanonicalPrefix(text: string): { command: Command; consumed: string } | null {
    const words = text.split(/\s+/);
    let acc = '';
    let best: { i: number; cmd: string } | null = null;
    for (let i = 0; i < words.length && i < 8; i++) {
        acc += smash(words[i]);
        if (CANONICAL_MAP.has(acc)) best = { i, cmd: CANONICAL_MAP.get(acc)! };
    }
    if (!best) return null;
    return { command: { cmd: best.cmd }, consumed: words.slice(0, best.i + 1).join(' ') };
}

// ---------------------------------------------------------------------------
// Greedy multi-command parser — Dragon-style continuous speech
// ---------------------------------------------------------------------------

export interface MultiResult {
    commands:  Command[];
    remainder: string;   // text not consumed — send to LLM if non-empty
}

export function fastInterpretMulti(utterance: string): MultiResult {
    let text = prepare(utterance);
    const commands: Command[] = [];

    while (text.length > 0) {
        let matched = false;
        for (const { prefix, build } of RULES) {
            const m = text.match(prefix);
            if (m) {
                commands.push(build(m));
                text = text.slice(m[0].length).replace(/^\s+/, '');
                matched = true;
                break;
            }
        }
        if (!matched) {
            const can = applyCanonicalPrefix(text);
            if (can) {
                commands.push(can.command);
                text = text.slice(can.consumed.length).replace(/^\s+/, '');
                matched = true;
            }
        }
        if (!matched) {
            // Terminal consumers — each takes the rest of the utterance.
            const fmt = applyFormatter(text) ?? applyCommentBlock(text);
            if (fmt) { commands.push(fmt); text = ''; matched = true; }
        }
        if (!matched) break;
    }

    return { commands, remainder: text };
}
