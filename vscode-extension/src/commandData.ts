// Single source of truth for fast-path text-insertion templates.
//
// fastPath.ts consumes `pattern` + `text` to build Rule entries.
// commandsPanel.ts consumes `phrase` + `desc` + `lang` to build panel rows.
//
// {CURSOR}       — insertion point after the template is placed
// ALL_CAPS_TEMPLATE — navigable placeholder: say "select foo template" to jump to it

export interface TemplateCmd {
    phrase:      string;   // Primary spoken phrase; also the panel display text
    pattern?:    string;   // Regex source override — default: phrase with spaces → \s+
    text:        string;   // Text to insert
    desc:        string;   // Human-readable panel description
    lang:        string;   // Language context for panel grouping ('python', 'go', …)
    structural?: boolean;  // True → wrap insert in startUndoGroup/endUndoGroup + setMark
}

export const TEMPLATE_CMDS: TemplateCmd[] = [

    // ---- Python boilerplate -------------------------------------------------
    { lang: 'python', phrase: 'shebang',
      // "hash bang" = technical name; catches "bang" alone and Whisper mishearings
      pattern: '(?:python\\s+)?(?:sh[ea]\\s*bang|hash\\s*bang)',
      text: '#!/usr/bin/env python3\n',
      desc: '#!/usr/bin/env python3  (say "shebang" or "hash bang")' },

    { lang: 'python', phrase: 'module doc', structural: true,
      text: '"""\n{CURSOR}TITLE_TEMPLATE\nUNDERLINE_TEMPLATE\nSUMMARY_TEMPLATE\n"""\n',
      desc: '"""TITLE / underline / SUMMARY  — say "underline" to auto-fill the separator"' },

    { lang: 'python', phrase: 'main guard', structural: true,
      text: 'if __name__ == "__main__":\n    ',
      desc: 'if __name__ == "__main__":' },

    { lang: 'python', phrase: 'sys exit',
      pattern: '(?:sys|this)\\s+exit',   // "this exit" is a common Whisper mishearing
      text: 'sys.exit({CURSOR})',
      desc: 'sys.exit(…)' },

    // ---- Python control flow ------------------------------------------------
    { lang: 'python', phrase: 'define function', structural: true,
      text: 'def {CURSOR}():\n    ',
      desc: 'def {cursor}():' },

    { lang: 'python', phrase: 'define method', structural: true,
      text: 'def {CURSOR}(self):\n    ',
      desc: 'def {cursor}(self):' },

    { lang: 'python', phrase: 'for loop', structural: true,
      text: 'for {CURSOR} in :\n    ',
      desc: 'for {cursor} in …:' },

    { lang: 'python', phrase: 'while loop', structural: true,
      pattern: '(?:while|why\\s+un)\\s*loop',  // "why unloop" is a common Whisper mishearing
      text: 'while {CURSOR}:\n    ',
      desc: 'while …:' },

    { lang: 'python', phrase: 'if block', structural: true,
      text: 'if {CURSOR}:\n    ',
      desc: 'if …:' },

    { lang: 'python', phrase: 'elif block', structural: true,
      text: 'elif {CURSOR}:\n    ',
      desc: 'elif …:' },

    { lang: 'python', phrase: 'else block', structural: true,
      text: 'else:\n    {CURSOR}',
      desc: 'else:' },

    { lang: 'python', phrase: 'try except', structural: true,
      pattern: 'try\\s+(?:block|except)',
      text: 'try:\n    {CURSOR}\nexcept EXCEPTION_TEMPLATE as error:\n    ',
      desc: 'try / except block' },

    { lang: 'python', phrase: 'with block', structural: true,
      text: 'with {CURSOR} as :\n    ',
      desc: 'with … as …:' },

    { lang: 'python', phrase: 'list comprehension',
      pattern: '(?:list|less)\\s+comprehension',  // "less comprehension" is a common Whisper mishearing
      text: '[{CURSOR} for  in ]',
      desc: '[expr for item in …]' },

    { lang: 'python', phrase: 'filtered comprehension',
      pattern: '(?:filtered|filter)\\s+comprehension',
      text: '[{CURSOR} for  in  if ]',
      desc: '[expr for item in … if condition]' },

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
    { lang: 'python', phrase: 'simple doc', structural: true,
      text: '"""\n{CURSOR}\n"""',
      desc: '""" simple one-paragraph docstring — indent is inferred from cursor position """' },

    { lang: 'python', phrase: 'function doc', structural: true,
      text: '"""{CURSOR}SUMMARY_TEMPLATE\n\n    Args:\n        ARGUMENTS_TEMPLATE\n\n    Returns:\n        RETURNS_TEMPLATE\n    """',
      desc: 'Python docstring (summary / args / returns)' },

    // Go: inserts above the func line; cursor lands at start of comment text.
    { lang: 'go', phrase: 'go doc',
      text: '// {CURSOR}SUMMARY_TEMPLATE\n',
      desc: 'Go comment above function' },
];
