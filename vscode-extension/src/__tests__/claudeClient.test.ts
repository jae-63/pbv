import { windowAroundCursor, windowForLines } from '../claudeClient';

const CONTENT = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');

// Simulates what VSCode reports as visible when the user can see lines 208–228.
// "create" appears on line 208 and "user" on line 211.
// A wider window (radius 30) would also expose line 237 which has create_user off-screen.
const FILE_WITH_OFFSCREEN = (() => {
    const lines: string[] = [];
    for (let i = 1; i <= 250; i++) {
        if (i === 208) lines.push('    # 1. Create Cognito test user');
        else if (i === 211) lines.push('    resp = cognito.admin_create_user(');
        else if (i === 237) lines.push('    # Note: admin_create_user bypasses signup');
        else lines.push(`line ${i}`);
    }
    return lines.join('\n');
})();

describe('windowAroundCursor', () => {
    test('returns lines centred around cursor', () => {
        const result = windowAroundCursor(CONTENT, 25, 3);
        const lines = result.split('\n');
        // radius 3 → 2*radius+1 = 7 lines (22..28, 1-based)
        expect(lines.length).toBe(7);
        expect(lines[0]).toMatch(/^22:/);
        expect(lines[6]).toMatch(/^28:/);
    });

    test('clamps at top of file', () => {
        const result = windowAroundCursor(CONTENT, 2, 5);
        const lines = result.split('\n');
        expect(lines[0]).toMatch(/^1:/);  // can't go before line 1
    });

    test('clamps at bottom of file', () => {
        const result = windowAroundCursor(CONTENT, 49, 5);
        const lines = result.split('\n');
        expect(lines[lines.length - 1]).toMatch(/^50:/);
    });

    test('line numbers are 1-based in output', () => {
        const result = windowAroundCursor(CONTENT, 1, 2);
        expect(result).toContain('1: line 1');
        expect(result).toContain('2: line 2');
    });

    test('content matches actual file lines', () => {
        const result = windowAroundCursor(CONTENT, 10, 1);
        expect(result).toContain('10: line 10');
    });
});

describe('windowForLines', () => {
    test('returns exactly the requested line range', () => {
        const result = windowForLines(CONTENT, 10, 15);
        const lines = result.split('\n');
        expect(lines.length).toBe(6);
        expect(lines[0]).toMatch(/^10:/);
        expect(lines[5]).toMatch(/^15:/);
    });

    test('clamps at top of file', () => {
        const result = windowForLines(CONTENT, -5, 3);
        expect(result.split('\n')[0]).toMatch(/^1:/);
    });

    test('clamps at bottom of file', () => {
        const result = windowForLines(CONTENT, 48, 99);
        const lines = result.split('\n');
        expect(lines[lines.length - 1]).toMatch(/^50:/);
    });

    test('visible window excludes off-screen occurrence — regression for select range', () => {
        // Visible lines 208–228: "create" on 208, "user" on 211 — both on screen.
        // Line 237 has admin_create_user but is NOT in the visible window.
        const excerpt = windowForLines(FILE_WITH_OFFSCREEN, 208, 228);
        expect(excerpt).toContain('208:');
        expect(excerpt).toContain('228:');
        expect(excerpt).not.toContain('237:');
        // The on-screen occurrences are present
        expect(excerpt).toContain('Create');
        expect(excerpt).toContain('admin_create_user');
    });
});
