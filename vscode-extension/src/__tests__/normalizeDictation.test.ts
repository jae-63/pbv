// Regression tests for normalizeDictation.
// Each test corresponds to a real "failed to hear" incident — see commit history.
// Add a new case here before fixing any new normalization bug.

import { normalizeDictation } from '../server';

// ---------------------------------------------------------------------------
// Whisper auto-period stripping (commit 578648c)
// Whisper adds sentence-end periods between letter contractions.
// ---------------------------------------------------------------------------
describe('Whisper auto-period stripping', () => {
    test('period-space stripped mid-utterance', () => {
        expect(normalizeDictation('hello. world')).toBe('hello world');
    });

    test('trailing period stripped', () => {
        expect(normalizeDictation('hello world.')).toBe('hello world');
    });

    test('letter romeo. Letter echo. → re', () => {
        // Full pipeline: periods stripped, NATO contracted, letters merged.
        expect(normalizeDictation('letter romeo. Letter echo.')).toBe('re');
    });

    test('import letter romeo. Letter echo. New line. → import re\\n', () => {
        // Space before "New" is preserved by newline replacement (\bnew\s*line → \n replaces only the keyword).
        expect(normalizeDictation('import letter romeo. Letter echo. New line.')).toBe('import re \n');
    });

    test('explicit "period" word is preserved', () => {
        // User saying "period" must still produce '.'.
        expect(normalizeDictation('end of sentence period')).toBe('end of sentence.');
    });
});

// ---------------------------------------------------------------------------
// Single-letter merging (commit 578648c)
// Whisper sometimes emits contracted letters as space-separated chars.
// ---------------------------------------------------------------------------
describe('adjacent single-letter merging', () => {
    test('r e → re', () => {
        expect(normalizeDictation('r e')).toBe('re');
    });

    test('r e n → ren', () => {
        expect(normalizeDictation('r e n')).toBe('ren');
    });

    test('multi-char word breaks the run', () => {
        // 'os' is two chars but a word boundary stops the merge.
        expect(normalizeDictation('a b os')).toBe('ab os');
    });
});

// ---------------------------------------------------------------------------
// NATO letter contraction (commit e06051f)
// ---------------------------------------------------------------------------
describe('NATO contraction', () => {
    test('"letter X" maps to single char', () => {
        expect(normalizeDictation('letter romeo')).toBe('r');
        expect(normalizeDictation('letter echo')).toBe('e');
    });

    test('bare sequence of 2+ NATO words → abbreviation', () => {
        expect(normalizeDictation('romeo echo')).toBe('re');
        expect(normalizeDictation('sierra yankee sierra')).toBe('sys');
    });

    test('single bare NATO word is left alone (false-positive guard)', () => {
        // "echo", "golf", "mike" etc. are real words.
        expect(normalizeDictation('echo')).toBe('echo');
    });
});

// ---------------------------------------------------------------------------
// "newline" → "\n"  (commit 693b964: new\s*line, was new\s+line)
// ---------------------------------------------------------------------------
describe('newline normalization', () => {
    test('"new line" (two words) → \\n', () => {
        expect(normalizeDictation('foo new line bar')).toBe('foo \n bar');
    });

    test('"newline" (one word) → \\n', () => {
        expect(normalizeDictation('foo newline bar')).toBe('foo \n bar');
    });
});

// ---------------------------------------------------------------------------
// Closing punctuation (commit 2ddec8d)
// ---------------------------------------------------------------------------
describe('closing punctuation', () => {
    test('comma', () => {
        expect(normalizeDictation('hello comma world')).toBe('hello, world');
    });

    test('period (spoken word)', () => {
        expect(normalizeDictation('hello period world')).toBe('hello. world');
    });

    test('full stop', () => {
        expect(normalizeDictation('hello full stop world')).toBe('hello. world');
    });

    test('exclamation mark', () => {
        expect(normalizeDictation('wow exclamation mark')).toBe('wow!');
    });

    test('exclamation point', () => {
        expect(normalizeDictation('wow exclamation point')).toBe('wow!');
    });

    test('question mark', () => {
        expect(normalizeDictation('really question mark')).toBe('really?');
    });

    test('colon', () => {
        expect(normalizeDictation('note colon foo')).toBe('note: foo');
    });

    test('semicolon', () => {
        expect(normalizeDictation('done semicolon next')).toBe('done; next');
    });

    test('hyphen', () => {
        expect(normalizeDictation('well hyphen known')).toBe('well-known');
    });

    test('hyphen at end of utterance', () => {
        expect(normalizeDictation('well hyphen')).toBe('well-');
    });

    test('dash → em-dash with space', () => {
        expect(normalizeDictation('foo dash bar')).toBe('foo — bar');
    });

    test('apostrophe', () => {
        expect(normalizeDictation("it apostrophe s")).toBe("it's");
    });

    test('close paren', () => {
        expect(normalizeDictation('foo close paren')).toBe('foo)');
    });

    test('close parenthesis', () => {
        expect(normalizeDictation('foo close parenthesis')).toBe('foo)');
    });

    test('close bracket', () => {
        expect(normalizeDictation('foo close bracket')).toBe('foo]');
    });

    test('close brace', () => {
        expect(normalizeDictation('foo close brace')).toBe('foo}');
    });

    test('close curly', () => {
        expect(normalizeDictation('foo close curly')).toBe('foo}');
    });

    test('close quote', () => {
        expect(normalizeDictation('foo close quote')).toBe('foo"');
    });
});

// ---------------------------------------------------------------------------
// Opening punctuation (commit 2ddec8d)
// ---------------------------------------------------------------------------
describe('opening punctuation', () => {
    test('open paren', () => {
        expect(normalizeDictation('open paren foo')).toBe('(foo');
    });

    test('open parenthesis', () => {
        expect(normalizeDictation('open parenthesis foo')).toBe('(foo');
    });

    test('open bracket', () => {
        expect(normalizeDictation('open bracket foo')).toBe('[foo');
    });

    test('open brace', () => {
        expect(normalizeDictation('open brace foo')).toBe('{foo');
    });

    test('open curly', () => {
        expect(normalizeDictation('open curly foo')).toBe('{foo');
    });

    test('open quote', () => {
        expect(normalizeDictation('open quote foo')).toBe('"foo');
    });
});

// ---------------------------------------------------------------------------
// Combined / real-world utterances
// ---------------------------------------------------------------------------
describe('combined real-world utterances', () => {
    test('function call with parens', () => {
        expect(normalizeDictation('print open paren hello comma world close paren'))
            .toBe('print (hello, world)');
    });

    test('sentence with period and comma', () => {
        expect(normalizeDictation('the quick comma brown fox period'))
            .toBe('the quick, brown fox.');
    });
});
