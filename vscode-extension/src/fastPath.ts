// Fast regex-based command matching — runs in <1ms, no LLM needed.
// Returns a command object on match, null to fall through to the LLM.
// Be conservative: only match when highly confident. False negatives
// (falling through to LLM) are fine; false positives are not.

type Command = Record<string, unknown>;

interface Rule {
    pattern: RegExp;
    build: (m: RegExpMatchArray) => Command;
}

const n = (s: string) => parseInt(s, 10);

const RULES: Rule[] = [
    // Navigation — word on line (must be before bare "line N" rule)
    // "word 3 on line 68" / "go to word 3 on line 68"
    { pattern: /^(?:go\s+to\s+)?word\s+(\d+)\s+(?:on\s+)?line\s+(\d+)$/i,
      build: m => ({ cmd: 'gotoWordOnLine', word: n(m[1]), line: n(m[2]) }) },
    // "go to 3rd word on line 68" / "3rd word on line 68"
    { pattern: /^(?:go\s+to\s+)?(\d+)(?:st|nd|rd|th)\s+word\s+(?:on\s+)?line\s+(\d+)$/i,
      build: m => ({ cmd: 'gotoWordOnLine', word: n(m[1]), line: n(m[2]) }) },

    // Navigation — line
    { pattern: /^(?:go\s+to\s+|goto\s+|jump\s+to\s+)?line\s+(\d+)$/i,
      build: m => ({ cmd: 'gotoLine', line: n(m[1]) }) },

    // Navigation — cursor up/down with count
    { pattern: /^(?:cursor\s+)?up\s+(\d+)(?:\s+lines?)?$/i,
      build: m => ({ cmd: 'cursorUp', n: n(m[1]) }) },
    { pattern: /^(?:cursor\s+)?up$/i,
      build: _  => ({ cmd: 'cursorUp', n: 1 }) },
    { pattern: /^(?:cursor\s+)?down\s+(\d+)(?:\s+lines?)?$/i,
      build: m => ({ cmd: 'cursorDown', n: n(m[1]) }) },
    { pattern: /^(?:cursor\s+)?down$/i,
      build: _  => ({ cmd: 'cursorDown', n: 1 }) },

    // Navigation — cursor movement
    { pattern: /^cursor\s+left$/i,   build: _ => ({ cmd: 'cursorLeft' }) },
    { pattern: /^cursor\s+right$/i,  build: _ => ({ cmd: 'cursorRight' }) },
    { pattern: /^(?:cursor\s+)?home$/i, build: _ => ({ cmd: 'cursorHome' }) },
    { pattern: /^(?:cursor\s+)?end(?:\s+of\s+line)?$/i, build: _ => ({ cmd: 'cursorEnd' }) },
    { pattern: /^(?:(?:cursor|go)\s+to\s+)?top$/i,    build: _ => ({ cmd: 'cursorTop' }) },
    { pattern: /^(?:(?:cursor|go)\s+to\s+)?bottom$/i, build: _ => ({ cmd: 'cursorBottom' }) },
    { pattern: /^page\s+up$/i,   build: _ => ({ cmd: 'pageUp' }) },
    { pattern: /^page\s+down$/i, build: _ => ({ cmd: 'pageDown' }) },

    // Cache pad
    { pattern: /^cache\s+(\d+)$/i,
      build: m => ({ cmd: 'insertCacheItem', index: n(m[1]) }) },
    { pattern: /^insert\s+cache(?:\s+item)?\s+(\d+)$/i,
      build: m => ({ cmd: 'insertCacheItem', index: n(m[1]) }) },

    // Deletion
    { pattern: /^delete\s+(?:this\s+)?line$/i,
      build: _ => ({ cmd: 'deleteLine' }) },
    { pattern: /^delete\s+(\d+)\s+words?$/i,
      build: m => ({ cmd: 'deleteWords', n: n(m[1]) }) },
    { pattern: /^delete\s+(?:a\s+)?word$/i,
      build: _ => ({ cmd: 'deleteWords', n: 1 }) },
    { pattern: /^delete\s+(\d+)\s+chars?(?:acters?)?$/i,
      build: m => ({ cmd: 'deleteChars', n: n(m[1]) }) },
    { pattern: /^delete\s+(?:to\s+)?end(?:\s+of\s+(?:the\s+)?line)?$/i,
      build: _ => ({ cmd: 'deleteToEndOfLine' }) },

    // Transactions
    { pattern: /^set\s+mark$/i,       build: _ => ({ cmd: 'setMark' }) },
    { pattern: /^undo\s+transaction$/i, build: _ => ({ cmd: 'undoTransaction' }) },

    // Document ops
    { pattern: /^save(?:\s+(?:the\s+)?(?:file|document))?$/i,
      build: _ => ({ cmd: 'save' }) },
    { pattern: /^undo(?:\s+that)?$/i, build: _ => ({ cmd: 'undo' }) },
    { pattern: /^redo$/i,             build: _ => ({ cmd: 'redo' }) },
    { pattern: /^format(?:\s+(?:the\s+)?(?:file|document))?$/i,
      build: _ => ({ cmd: 'formatDocument' }) },
    { pattern: /^(?:toggle\s+)?comment(?:\s+line)?$/i,
      build: _ => ({ cmd: 'toggleLineComment' }) },
    { pattern: /^select\s+all$/i, build: _ => ({ cmd: 'selectAll' }) },
    { pattern: /^copy$/i,  build: _ => ({ cmd: 'copy' }) },
    { pattern: /^cut$/i,   build: _ => ({ cmd: 'cut' }) },
    { pattern: /^paste$/i, build: _ => ({ cmd: 'paste' }) },
];

// Spoken number words → digits, so "go to line ten" matches the same rules as "go to line 10".
const WORD_NUMBERS: Record<string, number> = {
    zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
    ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
    sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20,
    thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
};

function normalizeNumbers(text: string): string {
    // Replace multi-word tens+ones ("twenty five" → "25") then single words ("ten" → "10").
    let t = text.replace(
        /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi,
        (_, tens, ones) => String((WORD_NUMBERS[tens.toLowerCase()] ?? 0) + (WORD_NUMBERS[ones.toLowerCase()] ?? 0)),
    );
    t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
        w => String(WORD_NUMBERS[w.toLowerCase()] ?? w),
    );
    return t;
}

export function fastInterpret(utterance: string): Command | null {
    // Strip trailing punctuation Apple Speech sometimes appends, then normalize number words.
    const text = normalizeNumbers(utterance.trim().replace(/[.,!?]+$/, ''));
    for (const { pattern, build } of RULES) {
        const m = text.match(pattern);
        if (m) return build(m);
    }
    return null;
}
