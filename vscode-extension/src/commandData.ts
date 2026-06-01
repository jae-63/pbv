// Single source of truth for fast-path text-insertion templates.
//
// fastPath.ts consumes `pattern` + `text` to build Rule entries.
// commandsPanel.ts consumes `phrase` + `desc` + `lang` to build panel rows.
//
// {CURSOR}       — insertion point after the template is placed
// ALL_CAPS_TEMPLATE — navigable placeholder: say "select foo template" to jump to it

export interface TemplateCmd {
    phrase:   string;   // Primary spoken phrase; also the panel display text
    pattern?: string;   // Regex source override — default: phrase with spaces → \s+
    text:     string;   // Text to insert
    desc:     string;   // Human-readable panel description
    lang:     string;   // Language context for panel grouping ('python', 'go', …)
}

export const TEMPLATE_CMDS: TemplateCmd[] = [

    // ---- Python boilerplate -------------------------------------------------
    { lang: 'python', phrase: 'shebang',
      // "hash bang" = technical name; catches "bang" alone and Whisper mishearings
      pattern: '(?:python\\s+)?(?:sh[ea]\\s*bang|hash\\s*bang)',
      text: '#!/usr/bin/env python3\n',
      desc: '#!/usr/bin/env python3  (say "shebang" or "hash bang")' },

    { lang: 'python', phrase: 'module doc',
      text: '"""\n{CURSOR}TITLE_TEMPLATE\n====================\nSUMMARY_TEMPLATE\n"""\n',
      desc: '"""TITLE / SUMMARY docstring"""' },

    { lang: 'python', phrase: 'main guard',
      text: 'if __name__ == "__main__":\n    ',
      desc: 'if __name__ == "__main__":' },

    { lang: 'python', phrase: 'sys exit',
      pattern: '(?:sys|this)\\s+exit',   // "this exit" is a common Whisper mishearing
      text: 'sys.exit({CURSOR})',
      desc: 'sys.exit(…)' },

    // ---- Python control flow ------------------------------------------------
    { lang: 'python', phrase: 'define function',
      text: 'def {CURSOR}():\n    ',
      desc: 'def {cursor}():' },

    { lang: 'python', phrase: 'define method',
      text: 'def {CURSOR}(self):\n    ',
      desc: 'def {cursor}(self):' },

    { lang: 'python', phrase: 'for loop',
      text: 'for {CURSOR} in :\n    ',
      desc: 'for {cursor} in …:' },

    { lang: 'python', phrase: 'while loop',
      pattern: '(?:while|why\\s+un)\\s*loop',  // "why unloop" is a common Whisper mishearing
      text: 'while {CURSOR}:\n    ',
      desc: 'while …:' },

    { lang: 'python', phrase: 'if block',
      text: 'if {CURSOR}:\n    ',
      desc: 'if …:' },

    { lang: 'python', phrase: 'elif block',
      text: 'elif {CURSOR}:\n    ',
      desc: 'elif …:' },

    { lang: 'python', phrase: 'else block',
      text: 'else:\n    {CURSOR}',
      desc: 'else:' },

    { lang: 'python', phrase: 'try except',
      pattern: 'try\\s+(?:block|except)',
      text: 'try:\n    {CURSOR}\nexcept EXCEPTION_TEMPLATE as error:\n    ',
      desc: 'try / except block' },

    { lang: 'python', phrase: 'with block',
      text: 'with {CURSOR} as :\n    ',
      desc: 'with … as …:' },

    { lang: 'python', phrase: 'list comprehension',
      pattern: '(?:list|less)\\s+comprehension',  // "less comprehension" is a common Whisper mishearing
      text: '[{CURSOR} for  in ]',
      desc: '[expr for item in …]' },

    { lang: 'python', phrase: 'dict comprehension',
      text: '{{CURSOR}: for  in }',
      desc: '{k: v for item in …}' },

    { lang: 'python', phrase: 'f string',
      text: 'f"{CURSOR}"',
      desc: 'f"…{expression}…"' },

    { lang: 'python', phrase: 'raw string',
      text: 'r"{CURSOR}"',
      desc: 'r"…" (no escape processing)' },

    // ---- Doc-comment templates ---------------------------------------------
    // ALL_CAPS placeholders are navigable: say "select summary template" etc.
    // Cursor lands at SUMMARY_TEMPLATE on insertion. Assumes 4-space Python indent.
    { lang: 'python', phrase: 'function doc',
      text: '"""{CURSOR}SUMMARY_TEMPLATE\n\n    Args:\n        ARGUMENTS_TEMPLATE\n\n    Returns:\n        RETURNS_TEMPLATE\n    """',
      desc: 'Python docstring (summary / args / returns)' },

    // Go: inserts above the func line; cursor lands at start of comment text.
    { lang: 'go', phrase: 'go doc',
      text: '// {CURSOR}SUMMARY_TEMPLATE\n',
      desc: 'Go comment above function' },
];
