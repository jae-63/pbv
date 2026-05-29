import { findTokenOffset, findRangeOffsets, candidateForms } from '../navigator';

const TEXT = `
# PostConfirmation Lambda does not fire. We write the record here
def triage_table():
    myVariableName = output_file_name + 1
    triageTable = True
    triage_completed = False
    GIG_WORKER_FLAG = True
    gig-worker-flag = True
`.trimStart();

// ---------------------------------------------------------------------------
// candidateForms
// ---------------------------------------------------------------------------

describe('candidateForms', () => {
    test('single word returns unchanged', () => {
        expect(candidateForms('triage_table')).toEqual(['triage_table']);
        expect(candidateForms('foo')).toEqual(['foo']);
    });

    test('two words generate all identifier forms', () => {
        const forms = candidateForms('triage completed');
        expect(forms).toContain('triage completed');   // literal
        expect(forms).toContain('triage_completed');   // snake
        expect(forms).toContain('triageCompleted');    // camel
        expect(forms).toContain('TriageCompleted');    // Pascal
        expect(forms).toContain('TRIAGE_COMPLETED');   // constant
        expect(forms).toContain('triage-completed');   // kebab
        expect(forms).toContain('triagecompleted');    // smash
    });

    test('three words', () => {
        const forms = candidateForms('gig worker flag');
        expect(forms).toContain('gig_worker_flag');
        expect(forms).toContain('gigWorkerFlag');
        expect(forms).toContain('GigWorkerFlag');
        expect(forms).toContain('GIG_WORKER_FLAG');
    });
});

// ---------------------------------------------------------------------------
// findTokenOffset
// ---------------------------------------------------------------------------

describe('findTokenOffset', () => {
    test('exact match returns offset and length', () => {
        const r = findTokenOffset(TEXT, 'triage_table', 0);
        expect(r).not.toBeNull();
        expect(TEXT.slice(r!.offset, r!.offset + r!.matchLength)).toBe('triage_table');
    });

    test('case-insensitive match', () => {
        const r = findTokenOffset(TEXT, 'lambda', 0);
        expect(r).not.toBeNull();
        expect(TEXT.slice(r!.offset, r!.offset + r!.matchLength)).toBe('Lambda');
    });

    test('spoken "triage completed" finds snake_case triage_completed', () => {
        const r = findTokenOffset(TEXT, 'triage completed', 0);
        expect(r).not.toBeNull();
        expect(TEXT.slice(r!.offset, r!.offset + r!.matchLength)).toBe('triage_completed');
    });

    test('spoken "triage table" finds snake_case triage_table', () => {
        const r = findTokenOffset(TEXT, 'triage table', 0);
        expect(r).not.toBeNull();
        expect(TEXT.slice(r!.offset, r!.offset + r!.matchLength)).toBe('triage_table');
    });

    test('spoken "my variable name" finds camelCase myVariableName', () => {
        const r = findTokenOffset(TEXT, 'my variable name', 0);
        expect(r).not.toBeNull();
        expect(TEXT.slice(r!.offset, r!.offset + r!.matchLength)).toBe('myVariableName');
    });

    test('spoken "gig worker flag" finds CONSTANT_CASE before kebab (first match wins)', () => {
        const r = findTokenOffset(TEXT, 'gig worker flag', 0);
        expect(r).not.toBeNull();
        // GIG_WORKER_FLAG comes before gig-worker-flag in the text
        expect(TEXT.slice(r!.offset, r!.offset + r!.matchLength)).toBe('GIG_WORKER_FLAG');
    });

    test('wraps past cursor when not found ahead', () => {
        const first = findTokenOffset(TEXT, 'triage_table', 0)!;
        const afterFirst = first.offset + first.matchLength;
        const wrapped = findTokenOffset(TEXT, 'triage_table', afterFirst);
        expect(wrapped?.offset).toBe(first.offset);
    });

    test('returns null when token not in text', () => {
        expect(findTokenOffset(TEXT, 'nonexistent_xyz', 0)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// findRangeOffsets
// ---------------------------------------------------------------------------

describe('findRangeOffsets', () => {
    test('selects from startToken to end of endToken', () => {
        const r = findRangeOffsets(TEXT, 'Lambda', 'record', 0);
        expect(r).not.toBeNull();
        const selected = TEXT.slice(r!.start, r!.end);
        expect(selected).toBe('Lambda does not fire. We write the record');
    });

    test('case-insensitive — spoken "lambda" finds "Lambda"', () => {
        const r = findRangeOffsets(TEXT, 'lambda', 'record', 0);
        expect(r).not.toBeNull();
        const selected = TEXT.slice(r!.start, r!.end);
        expect(selected).toContain('Lambda');
        expect(selected).toMatch(/record$/);
    });

    test('returns null when startToken not found', () => {
        expect(findRangeOffsets(TEXT, 'nosuchword', 'record', 0)).toBeNull();
    });

    test('returns null when endToken does not follow startToken', () => {
        expect(findRangeOffsets(TEXT, 'Lambda', 'nosuchword', 0)).toBeNull();
    });

    test('returns null when endToken only appears before startToken', () => {
        expect(findRangeOffsets(TEXT, 'triageTable', 'Lambda', 0)).toBeNull();
    });

    test('wraps cursor for startToken', () => {
        const lambdaResult = findTokenOffset(TEXT, 'Lambda', 0)!;
        const afterLambda  = lambdaResult.offset + lambdaResult.matchLength;
        const r = findRangeOffsets(TEXT, 'Lambda', 'record', afterLambda);
        expect(r).not.toBeNull();
        expect(TEXT.slice(r!.start, r!.end)).toContain('Lambda');
    });
});
