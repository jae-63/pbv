// Rule-based code transforms applied to selected text before falling through to the LLM.
// Returns replacement text on match, null to fall through.

const COMMENT_CHAR: Record<string, string> = {
    python:     '#',
    go:         '//',
    typescript: '//',
    javascript: '//',
    terraform:  '#',
    yaml:       '#',
    shellscript: '#',
};

// Spoken multi-word decorator names → Python identifier
const DECORATOR_ALIASES: Record<string, string> = {
    'static method':    'staticmethod',
    'class method':     'classmethod',
    'abstract method':  'abstractmethod',
    'abstract':         'abstractmethod',
    'property':         'property',
    'cached property':  'cached_property',
    'override':         'override',
    'dataclass':        'dataclass',
    'data class':       'dataclass',
};

function addDecoratorToSelection(decorator: string, selected: string): string {
    // Insert @decorator on the line before the first def/class in the selection,
    // matching that line's indentation.
    return selected.replace(
        /^(\s*)((?:async\s+)?def |class )/m,
        (_match, indent, kw) => `${indent}@${decorator}\n${indent}${kw}`,
    );
}

export function tryTransform(utterance: string, selected: string, language: string): string | null {
    const utt = utterance.trim().toLowerCase();

    // ── async / sync ────────────────────────────────────────────────────────
    if (/\b(make|convert|add)\b.*\basync\b/.test(utt)) {
        return selected.replace(/^(\s*)def\s/m, '$1async def ');
    }
    if (/\b(make|convert)\b.*\bsync(hronous)?\b/.test(utt) || /\bremove\b.*\basync\b/.test(utt)) {
        return selected.replace(/^(\s*)async\s+def\s/m, '$1def ');
    }

    // ── decorators ──────────────────────────────────────────────────────────
    // "add decorator <name>", "add <name> decorator", "add <name>"
    const decMatch =
        utt.match(/^add\s+decorator\s+(.+)$/) ||
        utt.match(/^add\s+(.+?)\s+decorator$/) ||
        utt.match(/^add\s+@?(\w[\w\s]*)$/);

    if (decMatch) {
        const spoken = decMatch[1].trim();
        const decorator = DECORATOR_ALIASES[spoken] ?? spoken.replace(/\s+/g, '_');
        return addDecoratorToSelection(decorator, selected);
    }

    // ── docstring (Python) ───────────────────────────────────────────────────
    if (/\badd\b.*\bdocstring\b/.test(utt) && language === 'python') {
        // Insert """TODO""" as first line of the function body.
        return selected.replace(
            /((?:async\s+)?def\s+[^:]+:)\n(\s*)/,
            (_m, sig, indent) => `${sig}\n${indent}"""TODO"""\n${indent}`,
        );
    }

    // ── comment / uncomment ──────────────────────────────────────────────────
    if (/\bcomment\b.*\bout\b/.test(utt) || /\bcomment\s+(?:this|these)\b/.test(utt)) {
        const ch = COMMENT_CHAR[language] ?? '//';
        return selected.split('\n').map(l => l.length ? `${ch} ${l}` : l).join('\n');
    }
    if (/\bun\s*comment\b/.test(utt)) {
        const ch = COMMENT_CHAR[language] ?? '//';
        const re = new RegExp(`^${ch}\\s?`);
        return selected.split('\n').map(l => l.replace(re, '')).join('\n');
    }

    // ── case transforms ──────────────────────────────────────────────────────
    if (/\b(make\s+)?upper\s*(case)?\b/.test(utt)) return selected.toUpperCase();
    if (/\b(make\s+)?lower\s*(case)?\b/.test(utt)) return selected.toLowerCase();

    return null;
}
