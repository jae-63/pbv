#!/usr/bin/env python3
"""
Generate the Vosk grammar (JSON phrase list) from PBV's command vocabulary.

Run:  python3 generate_grammar.py > grammar.json

The output is a sorted JSON array of lower-case spoken phrases plus "[unk]"
so Vosk can signal an out-of-grammar utterance rather than forcing a match.
Keep this file in sync with fastPath.ts / commandData.ts.
"""

import json


def num_words(n: int) -> str:
    """0-999 → English words, e.g. 42 → 'forty two'."""
    ones = [
        "", "one", "two", "three", "four", "five", "six", "seven",
        "eight", "nine", "ten", "eleven", "twelve", "thirteen",
        "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
    ]
    tens = ["", "", "twenty", "thirty", "forty", "fifty",
            "sixty", "seventy", "eighty", "ninety"]
    if n == 0:
        return "zero"
    if n < 20:
        return ones[n]
    if n < 100:
        t, o = tens[n // 10], ones[n % 10]
        return t + (" " + o if o else "")
    h = ones[n // 100] + " hundred"
    rest = n % 100
    return h + (" " + num_words(rest) if rest else "")


phrases: set[str] = set()


def add(*args: str) -> None:
    for p in args:
        phrases.add(p.lower().strip())


# ---------------------------------------------------------------------------
# No-argument commands — aliases from fastPath.ts rules + NO_ARG_COMMANDS
# ---------------------------------------------------------------------------

add(
    # Cache pad
    "clear cache pad", "empty cache", "empty cache pad",
    "show cache pad", "show cache",
    "refresh cache pad",
    # Modes
    "command mode", "coding mode", "back to commands", "back to command",
    "dictation mode", "dictation",
    "start dictation", "enter dictation", "begin dictation",
    "go to dictation mode", "switch to dictation mode",
    "enter dictation mode", "start dictation mode",
    "stop dictating", "stop dictation",
    # Transaction mark
    "set mark", "undo transaction", "jump to mark",
    # Nav bookmark
    "set bookmark", "set nav mark",
    "jump to bookmark", "jump to nav mark", "jump back",
    # Cursor (no-arg)
    "cursor left", "cursor right",
    "cursor home", "home",
    "cursor end", "end", "end of line",
    "cursor top", "top", "go to top",
    "cursor bottom", "bottom", "go to bottom",
    "page up", "page down",
    # Editing
    "delete line", "delete this line",
    "delete to end of line", "delete to end",
    "select all", "select word", "double select",
    "match paren", "match bracket", "match this paren",
    # Clipboard / history
    "copy", "cut", "paste",
    "undo", "undo that",
    "redo",
    # File
    "save", "save file", "save document", "save the file", "save the document",
    "save as",
    "new file", "close file", "next file", "previous file", "reopen file",
    # Document
    "format document", "format file", "format the document", "format the file", "format",
    "toggle line comment", "comment", "comment line",
    # Misc
    "cache selection", "cache this", "cache that", "cache word",
    "cache and assign", "cache assign",
    "accept", "accept completion", "accept suggestion",
    "show commands", "help", "what can i say",
    # Scroll / traversal
    "enter scroll mode", "exit scroll mode", "enter traversal mode",
    # String helpers
    "open string", "close string",
    # Text insertions (no arg)
    "new line", "newline",
    "return", "enter", "return key", "enter key", "press return", "press enter",
    "backspace",
    "no space",
    "underline", "underline dashes", "underline dash",
    # Arrow / annotation (no arg)
    "returns value", "returns type", "right arrow", "arrow",
    # Type nouns
    "argparse namespace", "argparse dot namespace",
    "default dict",
)

# ---------------------------------------------------------------------------
# Template commands (structural + insertion, no spoken argument)
# ---------------------------------------------------------------------------

add(
    "shebang", "hash bang",
    "module doc",
    "main guard",
    "sys exit", "this exit",
    "define function", "define method",
    "for loop",
    "while loop", "why unloop",
    "if block", "elif block", "else block",
    "try except", "try block",
    "with block",
    "list comprehension", "less comprehension",
    "filtered comprehension", "filter comprehension",
    "dict comprehension",
    "f string", "raw string",
    "simple doc", "function doc",
    "go doc",
    "section header",
)

# ---------------------------------------------------------------------------
# Symbol map — from fastPath.ts SYMBOL_MAP
# ---------------------------------------------------------------------------

add(
    "open bracket", "left bracket", "close bracket", "right bracket",
    "open brace", "left brace", "close brace", "right brace",
    "open paren", "left paren", "close paren", "right paren",
    "open angle bracket", "left angle bracket",
    "close angle bracket", "right angle bracket",
    "open angle", "left angle", "close angle", "right angle",
    "exclamation mark", "question mark",
    "dollar sign", "percent sign",
    "forward slash", "back slash", "backslash",
    "single quote", "double quote",
    "plus sign", "at sign",
    "greater than or equal", "less than or equal",
    "not equal", "double equals", "equals equals",
    "greater than", "less than",
    "colon space",
    "caret", "ampersand", "bang", "tilde",
    "semicolon", "colon", "apostrophe", "backtick",
    "plus", "comma", "dot", "period",
    "equal", "equals", "dash", "hyphen",
    "hash", "pound", "star", "asterisk",
    "underscore", "pipe", "slash", "space",
)

# ---------------------------------------------------------------------------
# Python keywords
# ---------------------------------------------------------------------------

BARE_KEYWORDS = ["lambda", "yield", "raise", "pass", "break", "continue", "len"]
KEYWORD_MAP   = [
    "return", "for", "in", "if", "else", "elif", "and", "or", "not",
    "is", "as", "while", "with", "from", "import", "del", "assert",
    "global", "nonlocal",
]
for kw in BARE_KEYWORDS:
    add(kw)
for kw in KEYWORD_MAP:
    add(f"keyword {kw}")

# ---------------------------------------------------------------------------
# NATO alphabet — "letter X" and "cap letter X"
# ---------------------------------------------------------------------------

NATO = [
    "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
    "india", "juliet", "juliett", "kilo", "lima", "mike", "november", "oscar",
    "papa", "quebec", "romeo", "sierra", "tango", "uniform", "victor",
    "whiskey", "x-ray", "xray", "yankee", "zulu",
]
for w in NATO:
    add(f"letter {w}", f"cap letter {w}")

# ---------------------------------------------------------------------------
# Type annotations and expressions
# ---------------------------------------------------------------------------

add(
    "annotate string", "annotate strings",
    "annotate int", "annotate integer",
    "annotate float", "annotate bool", "annotate boolean",
    "annotate path", "annotate namespace", "annotate exception",
    "annotate list of string", "annotate list of strings",
    "annotate list of int", "annotate list of integers",
    "annotate list of float", "annotate list of bool",
    "annotate dict of strings to int", "annotate dict of strings to str",
    "annotate dict of strings to float", "annotate dict of strings to bool",
    "annotate optional path", "annotate optional string",
    "annotate optional int", "annotate optional float", "annotate optional bool",
    "annotate optional namespace",
    "annotate list of tuples string int",
    # Bare type expressions
    "list of string", "list of strings",
    "list of int", "list of integers",
    "list of float", "list of bool",
    "list of tuples string int",
    "dict of strings to int", "dict of strings to str",
    "dict of strings to float", "dict of strings to bool",
    "optional path", "optional string", "optional int",
    "optional float", "optional bool", "optional namespace",
    # "type X"
    "type string", "type str", "type strings",
    "type int", "type integer",
    "type float", "type bool", "type boolean",
    "type none", "type path", "type namespace", "type exception",
)

# ---------------------------------------------------------------------------
# Formatters (bare prefix only — argument is always free text)
# Vosk won't match these (no free-text slot), so including the bare prefixes
# catches mis-segmented utterances where the argument got dropped.
# ---------------------------------------------------------------------------

for fmt in ["snake", "camel", "hammer", "pascal", "constant", "kebab",
            "smash", "dotted", "packed"]:
    add(fmt)

# ---------------------------------------------------------------------------
# Navigation with spoken numbers
# ---------------------------------------------------------------------------

# "go to line N" — 1..250
for n in range(1, 251):
    w = num_words(n)
    add(f"go to line {w}", f"line {w}", f"goto line {w}", f"jump to line {w}")

# "up / down N [lines]" — 1..50
for n in range(1, 51):
    w = num_words(n)
    for prefix in ("up", "down"):
        add(f"{prefix} {w}", f"{prefix} {w} lines",
            f"cursor {prefix} {w}", f"cursor {prefix} {w} lines",
            f"move {prefix} {w}", f"move {prefix} {w} lines")

# "cursor left / right N [characters]" — 1..50
for n in range(1, 51):
    w = num_words(n)
    for prefix in ("left", "right"):
        add(f"cursor {prefix} {w}", f"cursor {prefix} {w} characters",
            f"move {prefix} {w}", f"move {prefix} {w} characters")

# ---------------------------------------------------------------------------
# Deletion with spoken numbers
# ---------------------------------------------------------------------------

for n in range(1, 21):
    w = num_words(n)
    add(f"delete {w} words", f"delete {w} word",
        f"delete {w} characters", f"delete {w} character",
        f"delete {w} lines", f"delete {w} line")

add("delete a word", "delete word")

# ---------------------------------------------------------------------------
# Cache retrieval — "cache N", "recent N" — 1..20
# ---------------------------------------------------------------------------

for n in range(1, 21):
    w = num_words(n)
    add(f"cache {w}", f"recent {w}",
        f"insert cache {w}", f"insert cache item {w}")

# ---------------------------------------------------------------------------
# Undo/revert N transactions — 1..10
# ---------------------------------------------------------------------------

for n in range(1, 11):
    w = num_words(n)
    add(f"undo {w} transactions", f"undo {w} transaction",
        f"revert {w} transactions", f"revert {w} transaction")

# ---------------------------------------------------------------------------
# "numeral N" / "number N" — 0..99  (avoid ambiguity with dictated numbers)
# ---------------------------------------------------------------------------

for n in range(0, 100):
    w = num_words(n)
    add(f"numeral {w}", f"number {w}")

# ---------------------------------------------------------------------------
# "press / type CHAR N times" — selected chars, 1..30
# ---------------------------------------------------------------------------

PRESS_CHARS = [
    "equal", "equals", "dash", "hyphen", "hash", "pound", "star", "asterisk",
    "underscore", "tilde", "dot", "pipe", "slash", "backtick", "space",
]
for ch in PRESS_CHARS:
    for n in range(1, 31):
        w = num_words(n)
        add(f"press {ch} {w} times", f"type {ch} {w} times")

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

result = sorted(phrases) + ["[unk]"]
print(json.dumps(result, indent=2))
