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
    rule('cursor\\s+left',   _ => ({ cmd: 'cursorLeft' })),
    rule('cursor\\s+right',  _ => ({ cmd: 'cursorRight' })),
    rule('(?:cursor\\s+)?home', _ => ({ cmd: 'cursorHome' })),
    rule('(?:cursor\\s+)?end(?:\\s+of\\s+line)?', _ => ({ cmd: 'cursorEnd' })),
    rule('(?:(?:cursor|go)\\s+to\\s+)?top',    _ => ({ cmd: 'cursorTop' })),
    rule('(?:(?:cursor|go)\\s+to\\s+)?bottom', _ => ({ cmd: 'cursorBottom' })),
    rule('page\\s+up',   _ => ({ cmd: 'pageUp' })),
    rule('page\\s+down', _ => ({ cmd: 'pageDown' })),

    // Cache pad
    rule('cache\\s+(\\d+)',
         m => ({ cmd: 'insertCacheItem', index: n(m[1]) })),
    rule('insert\\s+cache(?:\\s+item)?\\s+(\\d+)',
         m => ({ cmd: 'insertCacheItem', index: n(m[1]) })),

    // Deletion
    rule('delete\\s+(?:this\\s+)?line',         _ => ({ cmd: 'deleteLine' })),
    rule('delete\\s+(\\d+)\\s+words?',          m => ({ cmd: 'deleteWords', n: n(m[1]) })),
    rule('delete\\s+(?:a\\s+)?word',            _ => ({ cmd: 'deleteWords', n: 1 })),
    rule('delete\\s+(\\d+)\\s+chars?(?:acters?)?', m => ({ cmd: 'deleteChars', n: n(m[1]) })),
    rule('delete\\s+(?:to\\s+)?end(?:\\s+of\\s+(?:the\\s+)?line)?',
         _ => ({ cmd: 'deleteToEndOfLine' })),

    // Transactions
    rule('set\\s+mark',        _ => ({ cmd: 'setMark' })),
    rule('undo\\s+transaction', _ => ({ cmd: 'undoTransaction' })),

    // Document ops
    rule('save(?:\\s+(?:the\\s+)?(?:file|document))?', _ => ({ cmd: 'save' })),
    rule('undo(?:\\s+that)?', _ => ({ cmd: 'undo' })),
    rule('redo',              _ => ({ cmd: 'redo' })),
    rule('format(?:\\s+(?:the\\s+)?(?:file|document))?', _ => ({ cmd: 'formatDocument' })),
    rule('(?:toggle\\s+)?comment(?:\\s+line)?', _ => ({ cmd: 'toggleLineComment' })),
    rule('select\\s+all', _ => ({ cmd: 'selectAll' })),
    rule('copy',  _ => ({ cmd: 'copy' })),
    rule('cut',   _ => ({ cmd: 'cut' })),
    rule('paste', _ => ({ cmd: 'paste' })),
];

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
    return normalizeNumbers(stripped);
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
    return null;
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
        if (!matched) break;
    }

    return { commands, remainder: text };
}
