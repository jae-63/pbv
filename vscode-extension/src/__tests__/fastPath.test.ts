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

    test('delete characters', () => {
        expect(fastInterpret('delete 5 characters')).toEqual({ cmd: 'deleteChars', n: 5 });
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
        expect(fastInterpret('define function')).toMatchObject({ cmd: 'insertStructure' });
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

    test('NATO jump — ordinals survive normalizeNumbers conversion', () => {
        // normalizeNumbers converts "first" → "1st", "second" → "2nd", etc.
        // The rule must match the digit form and ordinalToN must decode it.
        const j = (s: string) => fastInterpret(s);
        expect(j('jump to first juliet on 33')).toEqual({ cmd: 'jumpToCharOnLine', ordinal: 1, char: 'j', line: 33 });
        expect(j('jump to second sierra on 10')).toEqual({ cmd: 'jumpToCharOnLine', ordinal: 2, char: 's', line: 10 });
        expect(j('jump to last underscore on 5')).toEqual({ cmd: 'jumpToCharOnLine', ordinal: -1, char: '_', line: 5 });
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

    test('defineFunction — "define function/method FORMATTER NAME" inserts and caches function name', () => {
        const r1 = fastInterpretMulti('define function snake normalize text for counting');
        expect(r1.commands).toEqual([{ cmd: 'defineFunction', text: 'normalize_text_for_counting' }]);
        expect(r1.remainder).toBe('');

        const r2 = fastInterpretMulti('define function camel count word frequencies');
        expect(r2.commands).toEqual([{ cmd: 'defineFunction', text: 'countWordFrequencies' }]);

        const r3 = fastInterpretMulti('define method snake my method name');
        expect(r3.commands).toEqual([{ cmd: 'defineFunction', text: 'my_method_name' }]);

        // Whisper often renders "define function" as "to find a function"
        const r3w = fastInterpretMulti('to find a function snake normalize text for counting');
        expect(r3w.commands).toEqual([{ cmd: 'defineFunction', text: 'normalize_text_for_counting' }]);

        // Regular formatter does NOT produce defineFunction.
        const r4 = fastInterpretMulti('snake raw text');
        expect(r4.commands).toEqual([{ cmd: 'insertText', text: 'raw_text' }]);

        // Bare "define function" (no formatter) still fires the template.
        const r5 = fastInterpretMulti('define function');
        expect(r5.commands[0]).toMatchObject({ cmd: 'insertStructure' });
        expect((r5.commands[0] as any).text).toContain('def ');
    });

    test('"X that/this" passes through fast path (selection-transform intent)', () => {
        // These refer to the active selection and must reach tryTransform in server.ts,
        // not be consumed as formatter("that") → insertText:"that".
        // Remainder is the full utterance so server.ts uses it as llmInput for tryTransform.
        for (const word of ['that', 'this']) {
            for (const verb of ['smash', 'camel', 'snake', 'constant', 'kebab', 'pascal', 'hammer']) {
                const phrase = `${verb} ${word}`;
                const r = fastInterpretMulti(phrase);
                expect(r.commands).toHaveLength(0);
                expect(r.remainder).toBe(phrase);
            }
        }
    });

    test('"annotate TYPE" → ": type" — robust annotation prefix', () => {
        const ins = (s: string) => fastInterpretMulti(s).commands[0];
        expect(ins('annotate string')).toEqual({ cmd: 'insertText', text: ': str' });
        expect(ins('annotate integer')).toEqual({ cmd: 'insertText', text: ': int' });
        expect(ins('annotate path')).toEqual({ cmd: 'insertText', text: ': Path' });
        expect(ins('annotate list of string')).toEqual({ cmd: 'insertText', text: ': list[str]' });
        expect(ins('annotate dict string integer')).toEqual({ cmd: 'insertText', text: ': dict[str, int]' });
        expect(ins('annotate optional path')).toEqual({ cmd: 'insertText', text: ': Optional[Path]' });
        expect(ins('annotate list of tuple string integer')).toEqual({ cmd: 'insertText', text: ': list[tuple[str, int]]' });

        // "annotate string close paren" chains: ": str" + ")" in one utterance
        const r = fastInterpretMulti('annotate string close paren');
        expect(r.commands).toEqual([
            { cmd: 'insertText', text: ': str' },
            { cmd: 'insertText', text: ')' },
        ]);
        expect(r.remainder).toBe('');
    });

    test('Python type expressions', () => {
        const ins = (s: string) => fastInterpretMulti(s).commands[0];
        expect(ins('list of str')).toEqual({ cmd: 'insertText', text: 'list[str]' });
        expect(ins('list str')).toEqual({ cmd: 'insertText', text: 'list[str]' });
        expect(ins('list of int')).toEqual({ cmd: 'insertText', text: 'list[int]' });
        expect(ins('list of strings')).toEqual({ cmd: 'insertText', text: 'list[str]' });
        expect(ins('dict str int')).toEqual({ cmd: 'insertText', text: 'dict[str, int]' });
        expect(ins('dict of str to int')).toEqual({ cmd: 'insertText', text: 'dict[str, int]' });
        expect(ins('dict of str str')).toEqual({ cmd: 'insertText', text: 'dict[str, str]' });
        expect(ins('list of tuple str int')).toEqual({ cmd: 'insertText', text: 'list[tuple[str, int]]' });
        expect(ins('list tuple str int')).toEqual({ cmd: 'insertText', text: 'list[tuple[str, int]]' });
        expect(ins('optional path')).toEqual({ cmd: 'insertText', text: 'Optional[Path]' });
        expect(ins('optional str')).toEqual({ cmd: 'insertText', text: 'Optional[str]' });
        expect(ins('optional int')).toEqual({ cmd: 'insertText', text: 'Optional[int]' });
        expect(ins('argparse namespace')).toEqual({ cmd: 'insertText', text: 'argparse.Namespace' });
        expect(ins('argparse dot namespace')).toEqual({ cmd: 'insertText', text: 'argparse.Namespace' });
        expect(ins('default dict')).toEqual({ cmd: 'insertText', text: 'defaultdict' });
        expect(ins('type str')).toEqual({ cmd: 'insertText', text: 'str' });
        expect(ins('type int')).toEqual({ cmd: 'insertText', text: 'int' });
        expect(ins('type none')).toEqual({ cmd: 'insertText', text: 'None' });
        expect(ins('type path')).toEqual({ cmd: 'insertText', text: 'Path' });
    });

    test('colon space chains with type rules — annotation workflow', () => {
        // "colon space type str" → ": str"  (param annotation in one breath)
        const r1 = fastInterpretMulti('colon space type str');
        expect(r1.commands).toEqual([
            { cmd: 'insertText', text: ': ' },
            { cmd: 'insertText', text: 'str' },
        ]);
        expect(r1.remainder).toBe('');

        // "colon space list of str" → ": list[str]"
        const r2 = fastInterpretMulti('colon space list of str');
        expect(r2.commands).toEqual([
            { cmd: 'insertText', text: ': ' },
            { cmd: 'insertText', text: 'list[str]' },
        ]);

        // "arrow list of str colon" → " -> list[str]:"  (return type annotation)
        const r3 = fastInterpretMulti('arrow list of str colon');
        expect(r3.commands).toEqual([
            { cmd: 'insertText', text: ' -> ' },
            { cmd: 'insertText', text: 'list[str]' },
            { cmd: 'insertText', text: ':' },
        ]);
        expect(r3.remainder).toBe('');

        // "default dict open paren type int close paren" → "defaultdict(int)"
        const r4 = fastInterpretMulti('default dict open paren type int close paren');
        expect(r4.commands).toEqual([
            { cmd: 'insertText', text: 'defaultdict' },
            { cmd: 'insertText', text: '(' },
            { cmd: 'insertText', text: 'int' },
            { cmd: 'insertText', text: ')' },
        ]);
        expect(r4.remainder).toBe('');
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

// ---------------------------------------------------------------------------
// Regression: LLM gate must not block fast-path commands
//
// The dispatch pipeline checks !claude AFTER fastInterpretMulti — if that
// guard ever moves above it again, these commands would silently stop working.
// Each phrase here must produce ≥1 command AND empty remainder (meaning the
// LLM is never needed, so an uninitialised claude client cannot block them).
// ---------------------------------------------------------------------------
describe('fast-path commands require no LLM — regression guard', () => {
    const CRITICAL: string[] = [
        // UI / mode
        'what can I say', 'help', 'show commands',
        'command mode', 'dictation mode',
        // Navigation
        'go to line 32', 'line 7', 'top', 'bottom', 'home', 'end',
        'up 3', 'down 5', 'page up', 'page down',
        // Editing
        'save', 'undo', 'redo', 'copy', 'cut', 'paste',
        'delete line', 'delete word', 'select all', 'format document',
        // Cache pad
        'clear cache pad', 'show cache pad', 'cache this', 'cache 1', 'recent 2',
        // Marks
        'set mark', 'jump to mark', 'undo transaction',
        'set bookmark', 'jump to bookmark', 'jump back',
        // File / tabs
        'new file', 'close file', 'next file', 'previous file', 'save as',
    ];

    test.each(CRITICAL)('"%s" resolves without LLM', phrase => {
        const { commands, remainder } = fastInterpretMulti(phrase);
        expect(commands.length).toBeGreaterThan(0);
        expect(remainder).toBe('');
    });


});

// ---------------------------------------------------------------------------
// Whisper mishearing aliases — regression guard
// If a pattern alias is accidentally removed, the mishearing goes to the LLM
// instead of routing to the right template.
// ---------------------------------------------------------------------------
describe('Whisper alias patterns', () => {
    const insertCmd = (text: string) => ({ cmd: 'insertText', text });

    test('shebang variants', () => {
        expect(fastInterpret('shebang')).toEqual(insertCmd('#!/usr/bin/env python3\n'));
        expect(fastInterpret('shabang')).toEqual(insertCmd('#!/usr/bin/env python3\n'));
        expect(fastInterpret('hash bang')).toEqual(insertCmd('#!/usr/bin/env python3\n'));
        expect(fastInterpret('python shebang')).toEqual(insertCmd('#!/usr/bin/env python3\n'));
    });

    test('sys exit / "this exit" mishearing', () => {
        expect(fastInterpret('sys exit')).toEqual(insertCmd('sys.exit({CURSOR})'));
        expect(fastInterpret('this exit')).toEqual(insertCmd('sys.exit({CURSOR})'));
    });

    test('list comprehension / "less comprehension" mishearing', () => {
        expect(fastInterpret('list comprehension')).toEqual(insertCmd('[{CURSOR} for  in ]'));
        expect(fastInterpret('less comprehension')).toEqual(insertCmd('[{CURSOR} for  in ]'));
    });

    test('while loop / "why unloop" mishearing', () => {
        const text = 'while {CURSOR}:\n    ';
        expect(fastInterpret('while loop')).toEqual({ cmd: 'insertStructure', text });
        expect(fastInterpret('why unloop')).toEqual({ cmd: 'insertStructure', text });
    });
});

// ---------------------------------------------------------------------------
// Press N times — character repeat command
// ---------------------------------------------------------------------------
describe('press N times', () => {
    test('equals', () => {
        expect(fastInterpret('press equals 5 times')).toEqual({ cmd: 'insertText', text: '=====' });
        expect(fastInterpret('press equal 3 times')).toEqual({ cmd: 'insertText', text: '===' });
        expect(fastInterpret('press equals 22')).toEqual({ cmd: 'insertText', text: '======================' });
    });

    test('dash / hash / star', () => {
        expect(fastInterpret('press dash 10 times')).toEqual({ cmd: 'insertText', text: '----------' });
        expect(fastInterpret('press hash 3 times')).toEqual({ cmd: 'insertText', text: '###' });
        expect(fastInterpret('press star 4 times')).toEqual({ cmd: 'insertText', text: '****' });
    });

    test('type synonym', () => {
        expect(fastInterpret('type equals 3 times')).toEqual({ cmd: 'insertText', text: '===' });
    });
});

// ---------------------------------------------------------------------------
// Import fast-path — multi-command utterances (regression: greedy .+ bug)
// ---------------------------------------------------------------------------
describe('import fast-path — multi-command utterances', () => {
    test('single import', () => {
        expect(fastInterpretMulti('import argparse')).toEqual({
            commands: [{ cmd: 'dictateText', text: 'import argparse' }],
            remainder: '',
        });
    });

    test('import letter romeo letter echo → dictateText with NATO module name', () => {
        // normalizeDictation converts "letter romeo letter echo" → "re" downstream
        expect(fastInterpretMulti('import letter romeo letter echo')).toEqual({
            commands: [{ cmd: 'dictateText', text: 'import letter romeo letter echo' }],
            remainder: '',
        });
    });

    test('two imports with embedded \\n from Whisper — newline must not break import rule', () => {
        // Regression: Whisper embeds literal \n between sentences; .+? in the import
        // rule doesn't cross \n, so "Letter\necho" would orphan "echo" to the LLM.
        // prepare() now flattens \n to space before any rule matching.
        const result = fastInterpretMulti('. Import argparse. New line. Import letter romeo. Letter\n echo. New line.');
        expect(result.commands).toHaveLength(4);
        expect(result.commands[0]).toEqual({ cmd: 'dictateText', text: 'import argparse' });
        expect(result.commands[1]).toEqual({ cmd: 'insertText',  text: '\n' });
        expect(result.commands[2]).toEqual({ cmd: 'dictateText', text: 'import letter romeo Letter echo' });
        expect(result.commands[3]).toEqual({ cmd: 'insertText',  text: '\n' });
        expect(result.remainder).toBe('');
    });

    test('two imports separated by new line — must dispatch as 3 commands, not 1', () => {
        // Regression: greedy .+ swallowed entire utterance into one dictateText.
        // prepare() now strips Whisper mid-sentence periods; import rule is non-greedy.
        const result = fastInterpretMulti('. Import argparse. New line. Import letter romeo. Letter echo.');
        expect(result.commands).toHaveLength(3);
        expect(result.commands[0]).toEqual({ cmd: 'dictateText', text: 'import argparse' });
        expect(result.commands[1]).toEqual({ cmd: 'insertText',  text: '\n' });
        expect(result.commands[2]).toEqual({ cmd: 'dictateText', text: 'import letter romeo Letter echo' });
        expect(result.remainder).toBe('');
    });

    test('two imports separated by newline (no Whisper periods)', () => {
        const result = fastInterpretMulti('import argparse new line import re');
        expect(result.commands).toHaveLength(3);
        expect(result.commands[0]).toEqual({ cmd: 'dictateText', text: 'import argparse' });
        expect(result.commands[1]).toEqual({ cmd: 'insertText',  text: '\n' });
        expect(result.commands[2]).toEqual({ cmd: 'dictateText', text: 'import re' });
    });
});

// ---------------------------------------------------------------------------
// TEMPLATE_CMDS coverage — every commandData.ts entry must match fast-path
// Prevents phrase drift where the data file is updated but the pattern breaks
// ---------------------------------------------------------------------------
import { TEMPLATE_CMDS } from '../commandData';

describe('commandData.ts — every phrase matches fast-path', () => {
    test.each(TEMPLATE_CMDS)('$phrase', ({ phrase, structural }) => {
        const result = fastInterpret(phrase);
        expect(result).not.toBeNull();
        expect(result?.cmd).toBe(structural ? 'insertStructure' : 'insertText');
    });
});
