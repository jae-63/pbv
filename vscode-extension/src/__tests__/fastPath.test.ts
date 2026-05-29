import { fastInterpret, fastInterpretMulti } from '../fastPath';

// ---------------------------------------------------------------------------
// fastInterpret — single-command exact match
// ---------------------------------------------------------------------------

describe('fastInterpret — navigation', () => {
    test('go to line N', () => {
        expect(fastInterpret('go to line 42')).toEqual({ cmd: 'gotoLine', line: 42 });
        expect(fastInterpret('line 7')).toEqual({ cmd: 'gotoLine', line: 7 });
        expect(fastInterpret('goto line 100')).toEqual({ cmd: 'gotoLine', line: 100 });
        expect(fastInterpret('jump to line 3')).toEqual({ cmd: 'gotoLine', line: 3 });
    });

    test('cursor up / down', () => {
        expect(fastInterpret('up 5')).toEqual({ cmd: 'cursorUp', n: 5 });
        expect(fastInterpret('down 3')).toEqual({ cmd: 'cursorDown', n: 3 });
        expect(fastInterpret('up')).toEqual({ cmd: 'cursorUp', n: 1 });
        expect(fastInterpret('cursor up 10')).toEqual({ cmd: 'cursorUp', n: 10 });
    });

    test('word on line', () => {
        expect(fastInterpret('word 3 on line 12')).toEqual({ cmd: 'gotoWordOnLine', word: 3, line: 12 });
        expect(fastInterpret('go to word 1 on line 5')).toEqual({ cmd: 'gotoWordOnLine', word: 1, line: 5 });
    });

    test('cursor movement', () => {
        expect(fastInterpret('top')).toEqual({ cmd: 'cursorTop' });
        expect(fastInterpret('bottom')).toEqual({ cmd: 'cursorBottom' });
        expect(fastInterpret('end of line')).toEqual({ cmd: 'cursorEnd' });
        expect(fastInterpret('home')).toEqual({ cmd: 'cursorHome' });
        expect(fastInterpret('page up')).toEqual({ cmd: 'pageUp' });
        expect(fastInterpret('page down')).toEqual({ cmd: 'pageDown' });
    });
});

describe('fastInterpret — deletion', () => {
    test('delete word', () => {
        expect(fastInterpret('delete word')).toEqual({ cmd: 'deleteWords', n: 1 });
        expect(fastInterpret('delete a word')).toEqual({ cmd: 'deleteWords', n: 1 });
        expect(fastInterpret('delete 3 words')).toEqual({ cmd: 'deleteWords', n: 3 });
    });

    test('delete line / to end', () => {
        expect(fastInterpret('delete line')).toEqual({ cmd: 'deleteLine' });
        expect(fastInterpret('delete this line')).toEqual({ cmd: 'deleteLine' });
        expect(fastInterpret('delete to end')).toEqual({ cmd: 'deleteToEndOfLine' });
        expect(fastInterpret('delete end of line')).toEqual({ cmd: 'deleteToEndOfLine' });
    });

    test('delete chars', () => {
        expect(fastInterpret('delete 5 chars')).toEqual({ cmd: 'deleteChars', n: 5 });
        expect(fastInterpret('delete 1 character')).toEqual({ cmd: 'deleteChars', n: 1 });
    });
});

describe('fastInterpret — document ops', () => {
    test('save / undo / redo', () => {
        expect(fastInterpret('save')).toEqual({ cmd: 'save' });
        expect(fastInterpret('save file')).toEqual({ cmd: 'save' });
        expect(fastInterpret('undo')).toEqual({ cmd: 'undo' });
        expect(fastInterpret('undo that')).toEqual({ cmd: 'undo' });
        expect(fastInterpret('redo')).toEqual({ cmd: 'redo' });
    });

    test('select word / all', () => {
        expect(fastInterpret('select word')).toEqual({ cmd: 'selectWord' });
        expect(fastInterpret('double select')).toEqual({ cmd: 'selectWord' });
        expect(fastInterpret('select all')).toEqual({ cmd: 'selectAll' });
    });

    test('copy / cut / paste', () => {
        expect(fastInterpret('copy')).toEqual({ cmd: 'copy' });
        expect(fastInterpret('cut')).toEqual({ cmd: 'cut' });
        expect(fastInterpret('paste')).toEqual({ cmd: 'paste' });
    });

    test('format / comment', () => {
        expect(fastInterpret('format')).toEqual({ cmd: 'formatDocument' });
        expect(fastInterpret('format document')).toEqual({ cmd: 'formatDocument' });
        expect(fastInterpret('comment line')).toEqual({ cmd: 'toggleLineComment' });
    });
});

describe('fastInterpret — transactions & marks', () => {
    test('set mark / jump to mark / undo transaction', () => {
        expect(fastInterpret('set mark')).toEqual({ cmd: 'setMark' });
        expect(fastInterpret('jump to mark')).toEqual({ cmd: 'jumpToMark' });
        expect(fastInterpret('undo transaction')).toEqual({ cmd: 'undoTransaction' });
    });
});

describe('fastInterpret — UI commands', () => {
    test('what can I say / help', () => {
        expect(fastInterpret('what can I say')).toEqual({ cmd: 'showCommands' });
        expect(fastInterpret('show commands')).toEqual({ cmd: 'showCommands' });
        expect(fastInterpret('help')).toEqual({ cmd: 'showCommands' });
    });

    test('mode switching', () => {
        expect(fastInterpret('command mode')).toEqual({ cmd: 'commandMode' });
        expect(fastInterpret('dictation mode')).toEqual({ cmd: 'dictationMode' });
    });
});

describe('fastInterpret — cache pad', () => {
    test('cache / recent', () => {
        expect(fastInterpret('cache 1')).toEqual({ cmd: 'insertCacheItem', index: 1 });
        expect(fastInterpret('recent 3')).toEqual({ cmd: 'insertCacheItem', index: 3 });
        expect(fastInterpret('at sign recent 2')).toEqual({ cmd: 'insertCacheItem', index: 2, prefix: '@' });
    });

    test('cache this / that / selection', () => {
        expect(fastInterpret('cache this')).toEqual({ cmd: 'cacheSelection' });
        expect(fastInterpret('cache that')).toEqual({ cmd: 'cacheSelection' });
        expect(fastInterpret('cache selection')).toEqual({ cmd: 'cacheSelection' });
    });

    test('accept completion', () => {
        expect(fastInterpret('accept')).toEqual({ cmd: 'acceptCompletion' });
        expect(fastInterpret('accept completion')).toEqual({ cmd: 'acceptCompletion' });
        expect(fastInterpret('accept suggestion')).toEqual({ cmd: 'acceptCompletion' });
    });
});

describe('fastInterpret — Python code templates', () => {
    test('define function / method', () => {
        expect(fastInterpret('define function')).toMatchObject({ cmd: 'insertText' });
        expect((fastInterpret('define function')!.text as string)).toContain('{CURSOR}');
        expect((fastInterpret('define function')!.text as string)).toContain('def ');
        expect((fastInterpret('define method')!.text as string)).toContain('self');
    });

    test('for loop / while loop', () => {
        expect((fastInterpret('for loop')!.text as string)).toContain('for ');
        expect((fastInterpret('for loop')!.text as string)).toContain(' in ');
        expect((fastInterpret('while loop')!.text as string)).toContain('while ');
    });

    test('if / elif / else blocks', () => {
        expect((fastInterpret('if block')!.text as string)).toContain('if ');
        expect((fastInterpret('elif block')!.text as string)).toContain('elif ');
        expect((fastInterpret('else block')!.text as string)).toContain('else:');
    });

    test('try except includes navigable EXCEPTION_TEMPLATE', () => {
        const text = fastInterpret('try except')!.text as string;
        expect(text).toContain('try:');
        expect(text).toContain('except ');
        expect(text).toContain('EXCEPTION_TEMPLATE');
        // navigable by voice: "select exception template" finds EXCEPTION_TEMPLATE
        const { findTokenOffset } = require('../navigator');
        const r = findTokenOffset(text, 'exception template', 0);
        expect(r).not.toBeNull();
    });

    test('try block is alias for try except', () => {
        expect(fastInterpret('try block')).toEqual(fastInterpret('try except'));
    });

    test('f string / raw string', () => {
        expect((fastInterpret('f string')!.text as string)).toBe('f"{CURSOR}"');
        expect((fastInterpret('raw string')!.text as string)).toBe('r"{CURSOR}"');
    });

    test('list / dict comprehension', () => {
        const lst = fastInterpret('list comprehension')!.text as string;
        expect(lst).toContain('[');
        expect(lst).toContain('for');
        expect(lst).toContain(' in ');
        const dct = fastInterpret('dict comprehension')!.text as string;
        expect(dct).toContain('{');
        expect(dct).toContain('for');
    });

    test('with block', () => {
        expect((fastInterpret('with block')!.text as string)).toContain('with ');
        expect((fastInterpret('with block')!.text as string)).toContain(' as ');
    });
});

describe('fastInterpret — dictation helpers', () => {
    test('no space deletes one char', () => {
        expect(fastInterpret('no space')).toEqual({ cmd: 'deleteChars', n: 1 });
    });

    test('open string inserts a quote', () => {
        expect(fastInterpret('open string')).toEqual({ cmd: 'insertText', text: '"' });
    });

    test('close string dispatches closeString', () => {
        expect(fastInterpret('close string')).toEqual({ cmd: 'closeString' });
    });
});

describe('fastInterpret — number normalisation', () => {
    test('word numbers', () => {
        expect(fastInterpret('line twenty five')).toEqual({ cmd: 'gotoLine', line: 25 });
        expect(fastInterpret('up three')).toEqual({ cmd: 'cursorUp', n: 3 });
        expect(fastInterpret('delete twelve words')).toEqual({ cmd: 'deleteWords', n: 12 });
    });

    test('ordinal words on line', () => {
        expect(fastInterpret('third word on line 10')).toEqual({ cmd: 'gotoWordOnLine', word: 3, line: 10 });
        expect(fastInterpret('first word on line 5')).toEqual({ cmd: 'gotoWordOnLine', word: 1, line: 5 });
    });
});

// Formatters are only reachable through fastInterpretMulti (not fastInterpret).
describe('fastInterpret — formatters via fastInterpret', () => {
    test('formatters reachable from fastInterpret', () => {
        expect(fastInterpret('snake foo bar')).toEqual({ cmd: 'insertText', text: 'foo_bar' });
        expect(fastInterpret('camel foo bar')).toEqual({ cmd: 'insertText', text: 'fooBar' });
    });
});

describe('fastInterpret — doc-comment templates', () => {
    test('function doc inserts Python docstring stub with navigable placeholders', () => {
        const r = fastInterpret('function doc');
        expect(r).not.toBeNull();
        const text = r!.text as string;
        expect(text).toContain('SUMMARY_TEMPLATE');
        expect(text).toContain('ARGUMENTS_TEMPLATE');
        expect(text).toContain('RETURNS_TEMPLATE');
        expect(text).toContain('Args:');
        expect(text).toContain('Returns:');
        expect(text).toContain('{CURSOR}');
    });

    test('go doc inserts Go comment line with navigable placeholder', () => {
        const r = fastInterpret('go doc');
        expect(r).not.toBeNull();
        const text = r!.text as string;
        expect(text).toMatch(/^\/\/ /);
        expect(text).toContain('SUMMARY_TEMPLATE');
        expect(text).toContain('{CURSOR}');
    });

    test('ARGUMENTS_TEMPLATE is found by "select arguments template" (voice navigation)', () => {
        const { findTokenOffset } = require('../navigator');
        const stub = '"""SUMMARY_TEMPLATE\n\n    Args:\n        ARGUMENTS_TEMPLATE\n\n    Returns:\n        RETURNS_TEMPLATE\n    """';
        const r = findTokenOffset(stub, 'arguments template', 0);
        expect(r).not.toBeNull();
        expect(stub.slice(r!.offset, r!.offset + r!.matchLength)).toBe('ARGUMENTS_TEMPLATE');
    });

    test('RETURNS_TEMPLATE is found by "select returns template"', () => {
        const { findTokenOffset } = require('../navigator');
        const stub = '"""SUMMARY_TEMPLATE\n\n    Args:\n        ARGUMENTS_TEMPLATE\n\n    Returns:\n        RETURNS_TEMPLATE\n    """';
        const r = findTokenOffset(stub, 'returns template', 0);
        expect(r).not.toBeNull();
        expect(stub.slice(r!.offset, r!.offset + r!.matchLength)).toBe('RETURNS_TEMPLATE');
    });
});

describe('fastInterpret — comment blocks', () => {
    const DASHES = '# ' + '-'.repeat(75);

    test('comment template inserts fixed TEMPLATE block', () => {
        const r = fastInterpret('comment template');
        expect(r).not.toBeNull();
        expect(r!.cmd).toBe('insertText');
        const text = r!.text as string;
        expect(text).toContain('# TEMPLATE');
        expect(text.startsWith(DASHES)).toBe(true);
        expect(text.endsWith('\n\n')).toBe(true);
    });

    test('comment block capitalises spoken title', () => {
        const r = fastInterpret('comment block text normalisation');
        expect(r).not.toBeNull();
        const text = r!.text as string;
        expect(text).toContain('# Text normalisation');
        expect(text.startsWith(DASHES)).toBe(true);
        expect(text.endsWith('\n\n')).toBe(true);
    });

    test('comment block preserves capitalisation after first word', () => {
        const r = fastInterpret('comment block entry point');
        expect((r!.text as string)).toContain('# Entry point');
    });
});

describe('fastInterpret — unrecognised / no match', () => {
    test('returns null for unknown utterances', () => {
        expect(fastInterpret('open the file')).toBeNull();
        expect(fastInterpret('make this async')).toBeNull();
        expect(fastInterpret('')).toBeNull();
    });

    test('select word/all are NOT caught by a generic select rule', () => {
        // Regression: ensure specific rules win over any general "select X" rule
        expect(fastInterpret('select word')).toEqual({ cmd: 'selectWord' });
        expect(fastInterpret('select all')).toEqual({ cmd: 'selectAll' });
    });
});

// ---------------------------------------------------------------------------
// fastInterpretMulti — Dragon-style continuous speech
// ---------------------------------------------------------------------------

describe('fastInterpretMulti', () => {
    test('single known command — no remainder', () => {
        const r = fastInterpretMulti('go to line 32');
        expect(r.commands).toEqual([{ cmd: 'gotoLine', line: 32 }]);
        expect(r.remainder).toBe('');
    });

    test('two chained commands', () => {
        const r = fastInterpretMulti('go to line 32 delete word');
        expect(r.commands).toEqual([
            { cmd: 'gotoLine', line: 32 },
            { cmd: 'deleteWords', n: 1 },
        ]);
        expect(r.remainder).toBe('');
    });

    test('three chained commands', () => {
        const r = fastInterpretMulti('up 3 delete line save');
        expect(r.commands).toEqual([
            { cmd: 'cursorUp', n: 3 },
            { cmd: 'deleteLine' },
            { cmd: 'save' },
        ]);
        expect(r.remainder).toBe('');
    });

    test('unknown utterance — passed as remainder', () => {
        const r = fastInterpretMulti('make this function async');
        expect(r.commands).toEqual([]);
        expect(r.remainder).toBe('make this function async');
    });

    test('known prefix + unknown remainder', () => {
        const r = fastInterpretMulti('go to line 5 make this async');
        expect(r.commands).toEqual([{ cmd: 'gotoLine', line: 5 }]);
        expect(r.remainder).toBe('make this async');
    });

    test('formatters — snake / camel / pascal / constant / kebab / smash', () => {
        const fmt = (s: string) => fastInterpretMulti(s).commands[0];
        expect(fmt('snake foo bar')).toEqual({ cmd: 'insertText', text: 'foo_bar' });
        expect(fmt('camel foo bar')).toEqual({ cmd: 'insertText', text: 'fooBar' });
        expect(fmt('hammer foo bar')).toEqual({ cmd: 'insertText', text: 'FooBar' });
        expect(fmt('pascal foo bar')).toEqual({ cmd: 'insertText', text: 'FooBar' });
        expect(fmt('constant foo bar')).toEqual({ cmd: 'insertText', text: 'FOO_BAR' });
        expect(fmt('kebab foo bar')).toEqual({ cmd: 'insertText', text: 'foo-bar' });
        expect(fmt('smash foo bar')).toEqual({ cmd: 'insertText', text: 'foobar' });
    });

    test('navigation then formatter', () => {
        const r = fastInterpretMulti('line 10 snake my var');
        expect(r.commands).toEqual([
            { cmd: 'gotoLine', line: 10 },
            { cmd: 'insertText', text: 'my_var' },
        ]);
        expect(r.remainder).toBe('');
    });

    test('Whisper punctuation stripped', () => {
        const r = fastInterpretMulti('Go to line 5.');
        expect(r.commands).toEqual([{ cmd: 'gotoLine', line: 5 }]);
        expect(r.remainder).toBe('');
    });
});
