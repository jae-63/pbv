"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode7 = __toESM(require("vscode"));

// src/cachepad.ts
var vscode = __toESM(require("vscode"));
var STOP_WORDS = /* @__PURE__ */ new Set([
  "if",
  "else",
  "elif",
  "for",
  "while",
  "with",
  "try",
  "except",
  "finally",
  "def",
  "class",
  "return",
  "yield",
  "import",
  "from",
  "as",
  "pass",
  "break",
  "continue",
  "raise",
  "lambda",
  "del",
  "global",
  "nonlocal",
  "assert",
  "async",
  "await",
  "not",
  "and",
  "or",
  "in",
  "is",
  "func",
  "var",
  "const",
  "type",
  "struct",
  "interface",
  "map",
  "chan",
  "go",
  "defer",
  "select",
  "range",
  "switch",
  "case",
  "default",
  "fallthrough",
  "package",
  "nil",
  "true",
  "false",
  "True",
  "False",
  "None",
  "resource",
  "data",
  "variable",
  "output",
  "locals",
  "module",
  "provider",
  "apiVersion",
  "kind",
  "metadata",
  "spec",
  "status",
  "name",
  "namespace"
]);
var IDENTIFIER_RE = /\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g;
var CachePadItem = class extends vscode.TreeItem {
  constructor(index, symbol, recent) {
    super(`${index}.  ${symbol}`, vscode.TreeItemCollapsibleState.None);
    this.index = index;
    this.symbol = symbol;
    this.recent = recent;
    this.description = "";
    this.tooltip = symbol;
    this.contextValue = "cachePadItem";
    if (recent) {
      this.iconPath = new vscode.ThemeIcon("symbol-variable", new vscode.ThemeColor("charts.yellow"));
    }
  }
};
var CachePad = class {
  constructor(maxItems, broadcast) {
    this.items = [];
    this.recentSet = /* @__PURE__ */ new Set();
    this.suppressAbsorb = false;
    // set by clear(); blocks absorbDocument until user adds an item or switches file
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.maxItems = maxItems;
    this.broadcast = broadcast;
  }
  // --- TreeDataProvider ------------------------------------------------
  getTreeItem(element) {
    return element;
  }
  getChildren() {
    return this.items.map(
      (sym, i) => new CachePadItem(i + 1, sym, this.recentSet.has(sym))
    );
  }
  // --- Public API -------------------------------------------------------
  getItems() {
    return [...this.items];
  }
  prepend(symbol) {
    if (STOP_WORDS.has(symbol)) return;
    if (symbol.length < 2) return;
    this.prependExplicit(symbol);
  }
  // Like prepend() but skips stop-word filtering — for user-directed caching
  // where the user explicitly chose what to cache.
  prependExplicit(symbol) {
    if (symbol.length < 1) return;
    this.suppressAbsorb = false;
    this.items = [symbol, ...this.items.filter((s) => s !== symbol)].slice(0, this.maxItems);
    this.markRecent(symbol);
    this.refresh();
  }
  insertAt(index) {
    const sym = this.items[index - 1];
    if (sym) this.markRecent(sym);
    return sym;
  }
  evict(index) {
    this.items.splice(index - 1, 1);
    this.refresh();
  }
  clear() {
    this.items = [];
    this.recentSet.clear();
    this.suppressAbsorb = true;
    this.refresh();
  }
  unsuppress() {
    this.suppressAbsorb = false;
  }
  sync(items) {
    this.items = items.slice(0, this.maxItems);
    this.refresh();
  }
  // Scan changed text regions in a document edit for new identifiers.
  absorbEdit(event) {
    for (const change of event.contentChanges) {
      const text = change.text;
      let m;
      IDENTIFIER_RE.lastIndex = 0;
      while ((m = IDENTIFIER_RE.exec(text)) !== null) {
        this.prepend(m[0]);
      }
    }
  }
  // Full rescan of the document — used on file open / manual refresh.
  absorbDocument(doc) {
    if (this.suppressAbsorb) return;
    const text = doc.getText();
    const found = [];
    let m;
    IDENTIFIER_RE.lastIndex = 0;
    while ((m = IDENTIFIER_RE.exec(text)) !== null) {
      if (!STOP_WORDS.has(m[0])) found.push(m[0]);
    }
    const unique = [...new Set(found)].slice(-this.maxItems).reverse();
    for (const sym of unique) {
      if (!this.items.includes(sym)) {
        this.items.push(sym);
      }
    }
    this.items = this.items.slice(0, this.maxItems);
    this.refresh();
  }
  // Cache the word the cursor is sitting on / adjacent to.
  cacheWordAtCursor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const range = editor.document.getWordRangeAtPosition(editor.selection.active, IDENTIFIER_RE);
    if (!range) return;
    const word = editor.document.getText(range);
    this.prepend(word);
  }
  // --- Private ----------------------------------------------------------
  markRecent(symbol) {
    this.recentSet.add(symbol);
    setTimeout(() => {
      this.recentSet.delete(symbol);
      this._onDidChangeTreeData.fire(void 0);
    }, 5e3);
  }
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
    this.broadcast({ event: "cacheUpdate", items: this.items });
  }
};

// src/statusbar.ts
var vscode2 = __toESM(require("vscode"));
var SCROLL_ARROW = {
  down: "\u2193",
  up: "\u2191",
  left: "\u2190",
  right: "\u2192"
};
var ModeStatusBar = class {
  constructor() {
    this.mode = "command";
    this.ready = false;
    this.scroll = { active: false };
    this.item = vscode2.window.createStatusBarItem(vscode2.StatusBarAlignment.Left, 1e3);
    this.item.command = void 0;
    this.render();
    this.item.show();
  }
  setMode(mode) {
    this.mode = mode;
    this.render();
  }
  setReady(ready) {
    this.ready = ready;
    this.render();
  }
  getMode() {
    return this.mode;
  }
  setScrollMode(state) {
    this.scroll = state;
    this.render();
  }
  dispose() {
    this.item.dispose();
  }
  [Symbol.dispose]() {
    this.dispose();
  }
  render() {
    const scrollSuffix = this.scrollSuffix();
    if (this.mode === "command") {
      this.item.text = `$(mic) COMMAND${scrollSuffix}`;
      if (this.scroll.active) {
        this.item.backgroundColor = new vscode2.ThemeColor("statusBarItem.prominentBackground");
        this.item.tooltip = this.scrollTooltip();
      } else if (this.ready) {
        this.item.backgroundColor = new vscode2.ThemeColor("statusBarItem.warningBackground");
        this.item.tooltip = "PBV: listening \u2014 utterances interpreted as commands";
      } else {
        this.item.backgroundColor = new vscode2.ThemeColor("statusBarItem.errorBackground");
        this.item.tooltip = "PBV: initializing speech recognition\u2026";
      }
    } else {
      this.item.text = `$(keyboard) DICTATION${scrollSuffix}`;
      this.item.backgroundColor = this.scroll.active ? new vscode2.ThemeColor("statusBarItem.prominentBackground") : void 0;
      this.item.tooltip = this.scroll.active ? this.scrollTooltip() : "PBV: dictation mode \u2014 speech is inserted as text";
    }
  }
  scrollSuffix() {
    if (!this.scroll.active) return "";
    if (this.scroll.kind === "traverse") return "  \u2261";
    const arrow = SCROLL_ARROW[this.scroll.direction] ?? "\u2193";
    return `  ${arrow}`;
  }
  scrollTooltip() {
    if (!this.scroll.active) return "";
    if (this.scroll.kind === "traverse") return 'PBV: traversal mode \u2014 "stop scrolling" to exit';
    return `PBV: scrolling ${this.scroll.direction} \u2014 "faster", "slower", "stop scrolling"`;
  }
};

// src/server.ts
var net = __toESM(require("net"));
var vscode5 = __toESM(require("vscode"));

// src/navigator.ts
var vscode3 = __toESM(require("vscode"));
function resolveModLine(targetMod, editor) {
  const current = editor.selection.active.line;
  const count = editor.document.lineCount;
  const mod = (targetMod % 100 + 100) % 100;
  let bestLine = -1;
  let bestDist = Infinity;
  for (let l = 0; l < count; l++) {
    if ((l + 1) % 100 === mod) {
      const dist = Math.abs(l - current);
      if (dist < bestDist) {
        bestDist = dist;
        bestLine = l;
      }
    }
  }
  return bestLine >= 0 ? bestLine : null;
}
async function gotoLine(targetMod) {
  const editor = vscode3.window.activeTextEditor;
  if (!editor) return;
  const line = resolveModLine(targetMod, editor);
  if (line === null) return;
  const pos = new vscode3.Position(line, 0);
  editor.selection = new vscode3.Selection(pos, pos);
  editor.revealRange(new vscode3.Range(pos, pos), vscode3.TextEditorRevealType.InCenter);
}
function tokenise(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    if (/\S/.test(text[i])) {
      const start = i;
      while (i < text.length && /\S/.test(text[i])) i++;
      tokens.push({ start, end: i });
    } else {
      i++;
    }
  }
  return tokens;
}
async function gotoWordOnLine(wordIndex, targetMod) {
  const editor = vscode3.window.activeTextEditor;
  if (!editor) return;
  const line = resolveModLine(targetMod, editor);
  if (line === null) return;
  const lineText = editor.document.lineAt(line).text;
  const tokens = tokenise(lineText);
  const idx = wordIndex - 1;
  if (idx < 0 || idx >= tokens.length) return;
  const pos = new vscode3.Position(line, tokens[idx].start);
  editor.selection = new vscode3.Selection(pos, pos);
  editor.revealRange(new vscode3.Range(pos, pos), vscode3.TextEditorRevealType.InCenter);
}
async function jumpToCharOnLine(ordinal, char, targetMod) {
  const editor = vscode3.window.activeTextEditor;
  if (!editor) return;
  let line;
  if (targetMod === -100) line = editor.selection.active.line;
  else if (targetMod === -101) line = editor.selection.active.line + 1;
  else if (targetMod === -102) line = editor.selection.active.line - 1;
  else line = resolveModLine(targetMod, editor);
  if (line === null || line < 0 || line >= editor.document.lineCount) return;
  const text = editor.document.lineAt(line).text;
  const positions = [];
  let idx = text.indexOf(char);
  while (idx !== -1) {
    positions.push(idx);
    idx = text.indexOf(char, idx + 1);
  }
  if (positions.length === 0) return;
  let col;
  if (ordinal > 0) {
    col = positions[Math.min(ordinal - 1, positions.length - 1)];
  } else {
    col = positions[Math.max(positions.length + ordinal, 0)];
  }
  const pos = new vscode3.Position(line, col);
  editor.selection = new vscode3.Selection(pos, pos);
  editor.revealRange(new vscode3.Range(pos, pos), vscode3.TextEditorRevealType.InCenter);
}
function candidateForms(token) {
  const words = token.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return [token];
  const lower = words.map((w) => w.toLowerCase());
  const capFirst2 = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return [
    token,
    // literal as spoken
    lower.join("_"),
    // snake_case
    lower[0] + lower.slice(1).map(capFirst2).join(""),
    // camelCase
    lower.map(capFirst2).join(""),
    // PascalCase
    lower.map((w) => w.toUpperCase()).join("_"),
    // CONSTANT_CASE
    lower.join("-"),
    // kebab-case
    lower.join("")
    // smashcase
  ];
}
function findTokenOffset(text, token, cursor) {
  const lower = text.toLowerCase();
  for (const candidate of candidateForms(token)) {
    const query = candidate.toLowerCase();
    let offset = lower.indexOf(query, cursor);
    if (offset === -1) offset = lower.indexOf(query, 0);
    if (offset !== -1) return { offset, matchLength: candidate.length };
  }
  return null;
}
function findRangeOffsets(text, startToken, endToken, cursor) {
  const startResult = findTokenOffset(text, startToken, cursor);
  if (!startResult) return null;
  const lower = text.toLowerCase();
  for (const candidate of candidateForms(endToken)) {
    const endQ = candidate.toLowerCase();
    const endIdx = lower.indexOf(endQ, startResult.offset + startResult.matchLength);
    if (endIdx !== -1) return { start: startResult.offset, end: endIdx + candidate.length };
  }
  return null;
}
async function selectRange(startToken, endToken) {
  const editor = vscode3.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const text = doc.getText();
  const cursor = doc.offsetAt(editor.selection.active);
  const range = findRangeOffsets(text, startToken, endToken, cursor);
  if (!range) return;
  const startPos = doc.positionAt(range.start);
  const endPos = doc.positionAt(range.end);
  editor.selection = new vscode3.Selection(startPos, endPos);
  editor.revealRange(new vscode3.Range(startPos, endPos), vscode3.TextEditorRevealType.InCenter);
}
async function selectToken(token) {
  const editor = vscode3.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const text = doc.getText();
  const cursor = doc.offsetAt(editor.selection.active);
  const found = findTokenOffset(text, token, cursor);
  if (!found) return;
  const startPos = doc.positionAt(found.offset);
  const endPos = doc.positionAt(found.offset + found.matchLength);
  editor.selection = new vscode3.Selection(startPos, endPos);
  editor.revealRange(new vscode3.Range(startPos, endPos), vscode3.TextEditorRevealType.InCenter);
}

// src/commandData.ts
var TEMPLATE_CMDS = [
  // ---- Python boilerplate -------------------------------------------------
  {
    lang: "python",
    phrase: "shebang",
    // "hash bang" = technical name; catches "bang" alone and Whisper mishearings
    pattern: "(?:python\\s+)?(?:sh[ea]\\s*bang|hash\\s*bang)",
    text: "#!/usr/bin/env python3\n",
    desc: '#!/usr/bin/env python3  (say "shebang" or "hash bang")'
  },
  {
    lang: "python",
    phrase: "module doc",
    text: '"""\n{CURSOR}TITLE_TEMPLATE\nUNDERLINE_TEMPLATE\nSUMMARY_TEMPLATE\n"""\n',
    desc: '"""TITLE / underline / SUMMARY  \u2014 say "underline" to auto-fill the separator"'
  },
  {
    lang: "python",
    phrase: "main guard",
    text: 'if __name__ == "__main__":\n    ',
    desc: 'if __name__ == "__main__":'
  },
  {
    lang: "python",
    phrase: "sys exit",
    pattern: "(?:sys|this)\\s+exit",
    // "this exit" is a common Whisper mishearing
    text: "sys.exit({CURSOR})",
    desc: "sys.exit(\u2026)"
  },
  // ---- Python control flow ------------------------------------------------
  {
    lang: "python",
    phrase: "define function",
    text: "def {CURSOR}():\n    ",
    desc: "def {cursor}():"
  },
  {
    lang: "python",
    phrase: "define method",
    text: "def {CURSOR}(self):\n    ",
    desc: "def {cursor}(self):"
  },
  {
    lang: "python",
    phrase: "for loop",
    text: "for {CURSOR} in :\n    ",
    desc: "for {cursor} in \u2026:"
  },
  {
    lang: "python",
    phrase: "while loop",
    pattern: "(?:while|why\\s+un)\\s*loop",
    // "why unloop" is a common Whisper mishearing
    text: "while {CURSOR}:\n    ",
    desc: "while \u2026:"
  },
  {
    lang: "python",
    phrase: "if block",
    text: "if {CURSOR}:\n    ",
    desc: "if \u2026:"
  },
  {
    lang: "python",
    phrase: "elif block",
    text: "elif {CURSOR}:\n    ",
    desc: "elif \u2026:"
  },
  {
    lang: "python",
    phrase: "else block",
    text: "else:\n    {CURSOR}",
    desc: "else:"
  },
  {
    lang: "python",
    phrase: "try except",
    pattern: "try\\s+(?:block|except)",
    text: "try:\n    {CURSOR}\nexcept EXCEPTION_TEMPLATE as error:\n    ",
    desc: "try / except block"
  },
  {
    lang: "python",
    phrase: "with block",
    text: "with {CURSOR} as :\n    ",
    desc: "with \u2026 as \u2026:"
  },
  {
    lang: "python",
    phrase: "list comprehension",
    pattern: "(?:list|less)\\s+comprehension",
    // "less comprehension" is a common Whisper mishearing
    text: "[{CURSOR} for  in ]",
    desc: "[expr for item in \u2026]"
  },
  {
    lang: "python",
    phrase: "dict comprehension",
    text: "{{CURSOR}: for  in }",
    desc: "{k: v for item in \u2026}"
  },
  {
    lang: "python",
    phrase: "f string",
    text: 'f"{CURSOR}"',
    desc: 'f"\u2026{expression}\u2026"'
  },
  {
    lang: "python",
    phrase: "raw string",
    text: 'r"{CURSOR}"',
    desc: 'r"\u2026" (no escape processing)'
  },
  // ---- Doc-comment templates ---------------------------------------------
  // ALL_CAPS placeholders are navigable: say "select summary template" etc.
  // Cursor lands at SUMMARY_TEMPLATE on insertion. Assumes 4-space Python indent.
  {
    lang: "python",
    phrase: "function doc",
    text: '"""{CURSOR}SUMMARY_TEMPLATE\n\n    Args:\n        ARGUMENTS_TEMPLATE\n\n    Returns:\n        RETURNS_TEMPLATE\n    """',
    desc: "Python docstring (summary / args / returns)"
  },
  // Go: inserts above the func line; cursor lands at start of comment text.
  {
    lang: "go",
    phrase: "go doc",
    text: "// {CURSOR}SUMMARY_TEMPLATE\n",
    desc: "Go comment above function"
  }
];

// src/fastPath.ts
var n = (s) => parseInt(s, 10);
function rule(src, build) {
  return {
    exact: new RegExp("^(?:" + src + ")$", "i"),
    prefix: new RegExp("^(?:" + src + ")(?=\\s|$)", "i"),
    build
  };
}
var PRESS_CHARS = {
  equal: "=",
  equals: "=",
  dash: "-",
  dashes: "-",
  hyphen: "-",
  hash: "#",
  hashes: "#",
  pound: "#",
  star: "*",
  stars: "*",
  asterisk: "*",
  underscore: "_",
  underscores: "_",
  tilde: "~",
  tildes: "~",
  dot: ".",
  dots: ".",
  period: ".",
  pipe: "|",
  pipes: "|",
  slash: "/",
  slashes: "/",
  backtick: "`",
  backticks: "`",
  space: " ",
  spaces: " "
};
var RULES = [
  // Navigation — word on line (before bare "line N")
  rule(
    "(?:go\\s+to\\s+)?word\\s+(\\d+)\\s+(?:on\\s+)?line\\s+(\\d+)",
    (m) => ({ cmd: "gotoWordOnLine", word: n(m[1]), line: n(m[2]) })
  ),
  rule(
    "(?:go\\s+to\\s+)?(\\d+)(?:st|nd|rd|th)\\s+word\\s+(?:on\\s+)?line\\s+(\\d+)",
    (m) => ({ cmd: "gotoWordOnLine", word: n(m[1]), line: n(m[2]) })
  ),
  // Navigation — line
  rule(
    "(?:go\\s+to\\s+|goto\\s+|jump\\s+to\\s+)?line\\s+(\\d+)",
    (m) => ({ cmd: "gotoLine", line: n(m[1]) })
  ),
  // Navigation — cursor up/down
  rule(
    "(?:cursor\\s+)?up\\s+(\\d+)(?:\\s+lines?)?",
    (m) => ({ cmd: "cursorUp", n: n(m[1]) })
  ),
  rule(
    "(?:cursor\\s+)?up",
    (_) => ({ cmd: "cursorUp", n: 1 })
  ),
  rule(
    "(?:cursor\\s+)?down\\s+(\\d+)(?:\\s+lines?)?",
    (m) => ({ cmd: "cursorDown", n: n(m[1]) })
  ),
  rule(
    "(?:cursor\\s+)?down",
    (_) => ({ cmd: "cursorDown", n: 1 })
  ),
  // Navigation — cursor movement
  rule("(?:cursor\\s+)?home", (_) => ({ cmd: "cursorHome" })),
  rule("(?:cursor\\s+)?end(?:\\s+of\\s+line)?", (_) => ({ cmd: "cursorEnd" })),
  rule("(?:(?:cursor|go)\\s+to\\s+)?top", (_) => ({ cmd: "cursorTop" })),
  rule("(?:(?:cursor|go)\\s+to\\s+)?bottom", (_) => ({ cmd: "cursorBottom" })),
  // Cache pad — retrieval
  rule(
    "cache\\s+(\\d+)",
    (m) => ({ cmd: "insertCacheItem", index: n(m[1]) })
  ),
  rule(
    "insert\\s+cache(?:\\s+item)?\\s+(\\d+)",
    (m) => ({ cmd: "insertCacheItem", index: n(m[1]) })
  ),
  // "recent N" — Dragon-era vocabulary for bare cache insertion
  rule(
    "recent\\s+(\\d+)",
    (m) => ({ cmd: "insertCacheItem", index: n(m[1]) })
  ),
  // "at sign recent N" — insert @identifier (Perl arrays, Python decorators, etc.)
  rule(
    "at\\s+sign\\s+recent\\s+(\\d+)",
    (m) => ({ cmd: "insertCacheItem", index: n(m[1]), prefix: "@" })
  ),
  // NATO phonetic navigation — full ordinal range + current/next/previous line
  // "jump to third tango on 21"  "jump to last underscore on current line"
  // "jump to second sierra on next line"
  rule(
    "jump\\s+to\\s+(first|second|third|fourth|fifth|sixth|last|penultimate)\\s+(.+?)\\s+on\\s+(?:(current|next|prev(?:ious)?)\\s+line|(\\d+))",
    (m) => ({
      cmd: "jumpToCharOnLine",
      ordinal: ordinalToN(m[1]),
      char: natoToChar(m[2]),
      line: lineRef(m[3], m[4])
    })
  ),
  // Deletion
  rule("delete\\s+(?:this\\s+)?line", (_) => ({ cmd: "deleteLine" })),
  rule("delete\\s+(\\d+)\\s+words?", (m) => ({ cmd: "deleteWords", n: n(m[1]) })),
  rule("delete\\s+(?:a\\s+)?word", (_) => ({ cmd: "deleteWords", n: 1 })),
  rule("delete\\s+(\\d+)\\s+chars?(?:acters?)?", (m) => ({ cmd: "deleteChars", n: n(m[1]) })),
  rule(
    "delete\\s+(?:to\\s+)?end(?:\\s+of\\s+(?:the\\s+)?line)?",
    (_) => ({ cmd: "deleteToEndOfLine" })
  ),
  // Text-insertion templates — derived from TEMPLATE_CMDS in commandData.ts.
  // Add new templates there; no change here needed.
  ...TEMPLATE_CMDS.map((tc) => {
    const src = tc.pattern ?? tc.phrase.replace(/\s+/g, "\\s+");
    return rule(src, (_) => ({ cmd: "insertText", text: tc.text }));
  }),
  // Dictation helpers
  rule("no\\s+space", (_) => ({ cmd: "deleteChars", n: 1 })),
  rule("open\\s+string", (_) => ({ cmd: "insertText", text: '"' })),
  rule("close\\s+string", (_) => ({ cmd: "closeString" })),
  // Dictate — replace selection (or insert at cursor) without LLM.
  // "dictate Word Frequency Counter" → inserts/replaces with exactly those words.
  // Dragon-style "Select and Say": select a placeholder, say "dictate <title>".
  rule("dictate\\s+(.+)", (m) => ({ cmd: "dictateText", text: m[1] })),
  // UI — voice-only access to help and cache pad
  // "show commands" handled by canonical; keep human aliases
  rule("what\\s+can\\s+I\\s+say", (_) => ({ cmd: "showCommands" })),
  rule("help", (_) => ({ cmd: "showCommands" })),
  rule("show\\s+cache(?:\\s+pad)?", (_) => ({ cmd: "showCachePad" })),
  // Navigation bookmark — survives buffer edits; auto-set on traversal entry.
  // "set bookmark" / "jump to bookmark" to distinguish from transaction mark.
  rule("set\\s+bookmark", (_) => ({ cmd: "setNavMark" })),
  rule("jump\\s+to\\s+bookmark", (_) => ({ cmd: "jumpToNavMark" })),
  rule("jump\\s+back", (_) => ({ cmd: "jumpToNavMark" })),
  // Accept inline completion (Tab / acceptSelectedSuggestion)
  rule("accept(?:\\s+(?:completion|suggestion))?", (_) => ({ cmd: "acceptCompletion" })),
  // Cache selection
  rule("cache\\s+(?:this|that|selection)", (_) => ({ cmd: "cacheSelection" })),
  // Word selection & bracket matching
  rule("double\\s+select", (_) => ({ cmd: "selectWord" })),
  rule(
    "match\\s+(?:this\\s+)?paren(?:thesis)?|match\\s+bracket",
    (_) => ({ cmd: "matchParen" })
  ),
  // Repeat-character insertion — "press equals 22 times", "press dash 40 times"
  // Unambiguous phrasing avoids clashing with dictated code like "equals 22".
  rule(
    "(?:press|type)\\s+(" + Object.keys(PRESS_CHARS).join("|") + ")\\s+(\\d+)(?:\\s+times?)?",
    (m) => ({ cmd: "insertText", text: (PRESS_CHARS[m[1].toLowerCase()] ?? "").repeat(n(m[2])) })
  ),
  // Underline — inserts chars matching the length of the line above the cursor
  rule("underline(?:\\s+dashes?)?", (m) => ({ cmd: "underlineLine", char: /dash/i.test(m[0]) ? "-" : "=" })),
  // Document ops — specific multi-word forms must precede their shorter prefixes
  // ("save as" must beat the "save" prefix; "undo transaction" must beat "undo")
  rule("save\\s+as", (_) => ({ cmd: "saveAs" })),
  rule("save(?:\\s+(?:the\\s+)?(?:file|document))?", (_) => ({ cmd: "save" })),
  rule("undo\\s+transaction", (_) => ({ cmd: "undoTransaction" })),
  rule("undo(?:\\s+that)?", (_) => ({ cmd: "undo" })),
  rule("format(?:\\s+(?:the\\s+)?(?:file|document))?", (_) => ({ cmd: "formatDocument" })),
  rule("(?:toggle\\s+)?comment(?:\\s+line)?", (_) => ({ cmd: "toggleLineComment" }))
];
var NATO = {
  alpha: "a",
  bravo: "b",
  charlie: "c",
  delta: "d",
  echo: "e",
  foxtrot: "f",
  golf: "g",
  hotel: "h",
  india: "i",
  juliet: "j",
  juliett: "j",
  kilo: "k",
  lima: "l",
  mike: "m",
  november: "n",
  oscar: "o",
  papa: "p",
  quebec: "q",
  romeo: "r",
  sierra: "s",
  tango: "t",
  uniform: "u",
  victor: "v",
  whiskey: "w",
  "x-ray": "x",
  xray: "x",
  yankee: "y",
  zulu: "z",
  // Named punctuation
  underscore: "_",
  "at sign": "@",
  at: "@",
  "percent sign": "%",
  asterisk: "*",
  "dollar sign": "$",
  "equals sign": "=",
  "equal sign": "=",
  "open paren": "(",
  "close paren": ")",
  "left paren": "(",
  "right paren": ")",
  "open bracket": "[",
  "close bracket": "]",
  "open brace": "{",
  "close brace": "}",
  semicolon: ";",
  colon: ":",
  comma: ",",
  period: ".",
  slash: "/",
  backslash: "\\",
  "exclamation mark": "!",
  "question mark": "?",
  "less than": "<",
  "greater than": ">",
  dash: "-",
  hyphen: "-"
};
function natoToChar(word) {
  const key = word.trim().toLowerCase();
  return NATO[key] ?? key[0] ?? "";
}
var ORDINAL_MAP = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  last: -1,
  penultimate: -2
};
function ordinalToN(word) {
  return ORDINAL_MAP[word.toLowerCase()] ?? 1;
}
function lineRef(word, absNum) {
  if (!word && absNum) return n(absNum);
  const w = (word ?? "").toLowerCase();
  if (w === "current") return -100;
  if (w === "next") return -101;
  if (w === "previous" || w === "prev") return -102;
  return absNum ? n(absNum) : -100;
}
var WORD_NUMBERS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
};
var ORDINAL_WORDS = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
  eighth: "8th",
  ninth: "9th",
  tenth: "10th",
  eleventh: "11th",
  twelfth: "12th",
  thirteenth: "13th",
  fourteenth: "14th",
  fifteenth: "15th",
  sixteenth: "16th",
  seventeenth: "17th",
  eighteenth: "18th",
  nineteenth: "19th",
  twentieth: "20th"
};
function normalizeNumbers(text) {
  let t = text.replace(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\b/gi,
    (w) => ORDINAL_WORDS[w.toLowerCase()] ?? w
  );
  t = t.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, tens, ones) => String((WORD_NUMBERS[tens.toLowerCase()] ?? 0) + (WORD_NUMBERS[ones.toLowerCase()] ?? 0))
  );
  t = t.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
    (w) => String(WORD_NUMBERS[w.toLowerCase()] ?? w)
  );
  return t;
}
function prepare(utterance) {
  const stripped = utterance.trim().replace(/^[.…,!?\s]+/, "").replace(/[.…,!?]+$/, "");
  return normalizeNumbers(stripped);
}
var FORMATTERS = {
  snake: (ts) => ts.map((t) => t.toLowerCase()).join("_"),
  camel: (ts) => ts[0].toLowerCase() + ts.slice(1).map(capFirst).join(""),
  hammer: (ts) => ts.map(capFirst).join(""),
  // PascalCase
  pascal: (ts) => ts.map(capFirst).join(""),
  constant: (ts) => ts.map((t) => t.toUpperCase()).join("_"),
  smash: (ts) => ts.map((t) => t.toLowerCase()).join(""),
  kebab: (ts) => ts.map((t) => t.toLowerCase()).join("-"),
  dotted: (ts) => ts.map((t) => t.toLowerCase()).join("."),
  packed: (ts) => ts.map((t) => t.toLowerCase()).join("::"),
  slasher: (ts) => "/" + ts.map((t) => t.toLowerCase()).join("/")
};
var FORMATTER_PATTERN = new RegExp(
  "^(" + Object.keys(FORMATTERS).join("|") + ")\\s+(.+)$",
  "i"
);
function capFirst(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function applyFormatter(utterance) {
  const m = utterance.match(FORMATTER_PATTERN);
  if (!m) return null;
  const fn = FORMATTERS[m[1].toLowerCase()];
  if (!fn) return null;
  const tokens = m[2].trim().split(/\s+/);
  return { cmd: "insertText", text: fn(tokens) };
}
var COMMENT_RULE = /^comment\s+(?:(template)|(block)\s+(.+))$/i;
var DASHES = "# " + "-".repeat(75);
function applyCommentBlock(utterance) {
  const m = utterance.match(COMMENT_RULE);
  if (!m) return null;
  const title = m[1] ? "TEMPLATE" : m[3].charAt(0).toUpperCase() + m[3].slice(1);
  return { cmd: "insertText", text: `${DASHES}
# ${title}
${DASHES}

` };
}
var NO_ARG_COMMANDS = [
  // Cache pad
  "clearCachePad",
  "showCachePad",
  "refreshCachePad",
  // Modes
  "commandMode",
  "dictationMode",
  // Transaction mark
  "setMark",
  "undoTransaction",
  "jumpToMark",
  // Nav bookmark
  "setNavMark",
  "jumpToNavMark",
  // No-arg cursor
  "cursorLeft",
  "cursorRight",
  "cursorHome",
  "cursorEnd",
  "cursorTop",
  "cursorBottom",
  "pageUp",
  "pageDown",
  // Editing
  "deleteLine",
  "deleteToEndOfLine",
  "selectAll",
  "selectWord",
  "matchParen",
  // Clipboard / history
  "copy",
  "cut",
  "paste",
  "undo",
  "redo",
  // File / tabs
  "newFile",
  "saveAs",
  "closeFile",
  "nextFile",
  "previousFile",
  "reopenFile",
  // Document
  "save",
  "formatDocument",
  "toggleLineComment",
  // Misc
  "cacheSelection",
  "acceptCompletion",
  "showCommands",
  // Scroll / traversal
  "enterScrollMode",
  "exitScrollMode",
  "enterTraversalMode"
];
function smash(s) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}
var CANONICAL_MAP = new Map(
  NO_ARG_COMMANDS.map((cmd) => [smash(cmd.replace(/([A-Z])/g, " $1")), cmd])
);
function applyCanonicalPrefix(text) {
  const words = text.split(/\s+/);
  let acc = "";
  let best = null;
  for (let i = 0; i < words.length && i < 8; i++) {
    acc += smash(words[i]);
    if (CANONICAL_MAP.has(acc)) best = { i, cmd: CANONICAL_MAP.get(acc) };
  }
  if (!best) return null;
  return { command: { cmd: best.cmd }, consumed: words.slice(0, best.i + 1).join(" ") };
}
function fastInterpretMulti(utterance) {
  let text = prepare(utterance);
  const commands3 = [];
  while (text.length > 0) {
    let matched = false;
    for (const { prefix, build } of RULES) {
      const m = text.match(prefix);
      if (m) {
        commands3.push(build(m));
        text = text.slice(m[0].length).replace(/^\s+/, "");
        matched = true;
        break;
      }
    }
    if (!matched) {
      const can = applyCanonicalPrefix(text);
      if (can) {
        commands3.push(can.command);
        text = text.slice(can.consumed.length).replace(/^\s+/, "");
        matched = true;
      }
    }
    if (!matched) {
      const fmt = applyFormatter(text) ?? applyCommentBlock(text);
      if (fmt) {
        commands3.push(fmt);
        text = "";
        matched = true;
      }
    }
    if (!matched) break;
  }
  return { commands: commands3, remainder: text };
}

// src/codeTransform.ts
var COMMENT_CHAR = {
  python: "#",
  go: "//",
  typescript: "//",
  javascript: "//",
  terraform: "#",
  yaml: "#",
  shellscript: "#"
};
var DECORATOR_ALIASES = {
  "static method": "staticmethod",
  "class method": "classmethod",
  "abstract method": "abstractmethod",
  "abstract": "abstractmethod",
  "property": "property",
  "cached property": "cached_property",
  "override": "override",
  "dataclass": "dataclass",
  "data class": "dataclass"
};
function addDecoratorToSelection(decorator, selected) {
  return selected.replace(
    /^(\s*)((?:async\s+)?def |class )/m,
    (_match, indent, kw) => `${indent}@${decorator}
${indent}${kw}`
  );
}
function tryTransform(utterance, selected, language) {
  const utt = utterance.trim().toLowerCase();
  if (/\b(make|convert|add)\b.*\basync\b/.test(utt)) {
    return selected.replace(/^(\s*)def\s/m, "$1async def ");
  }
  if (/\b(make|convert)\b.*\bsync(hronous)?\b/.test(utt) || /\bremove\b.*\basync\b/.test(utt)) {
    return selected.replace(/^(\s*)async\s+def\s/m, "$1def ");
  }
  const decMatch = utt.match(/^add\s+decorator\s+(.+)$/) || utt.match(/^add\s+(.+?)\s+decorator$/) || utt.match(/^add\s+@?(\w[\w\s]*)$/);
  if (decMatch) {
    const spoken = decMatch[1].trim();
    const decorator = DECORATOR_ALIASES[spoken] ?? spoken.replace(/\s+/g, "_");
    return addDecoratorToSelection(decorator, selected);
  }
  if (/\badd\b.*\bdocstring\b/.test(utt) && language === "python") {
    return selected.replace(
      /((?:async\s+)?def\s+[^:]+:)\n(\s*)/,
      (_m, sig, indent) => `${sig}
${indent}"""TODO"""
${indent}`
    );
  }
  if (/\bcomment\b.*\bout\b/.test(utt) || /\bcomment\s+(?:this|these)\b/.test(utt)) {
    const ch = COMMENT_CHAR[language] ?? "//";
    return selected.split("\n").map((l) => l.length ? `${ch} ${l}` : l).join("\n");
  }
  if (/\bun\s*comment\b/.test(utt)) {
    const ch = COMMENT_CHAR[language] ?? "//";
    const re = new RegExp(`^${ch}\\s?`);
    return selected.split("\n").map((l) => l.replace(re, "")).join("\n");
  }
  if (/\b(make\s+)?upper\s*(case)?\b/.test(utt)) return selected.toUpperCase();
  if (/\b(make\s+)?lower\s*(case)?\b/.test(utt)) return selected.toLowerCase();
  return null;
}

// src/commandsPanel.ts
var vscode4 = __toESM(require("vscode"));
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var import_child_process = require("child_process");
var UNIVERSAL = [
  {
    title: "Navigation",
    cmds: [
      { phrase: "line N", desc: "Go to line N (mod-100)" },
      { phrase: "word N on line M", desc: "Go to Nth token on line M" },
      { phrase: "go to Nth word on line M", desc: "Ordinal: first / second / \u2026 / last / penultimate" },
      { phrase: "jump to [ordinal] [char] on [line]", desc: '"jump to second tango on 21" \u2014 NATO char navigation' },
      { phrase: "jump to mark", desc: "Navigate to saved mark position" },
      { phrase: "match paren / match bracket", desc: "Jump to matching bracket or brace" },
      { phrase: "top / bottom", desc: "Start / end of file" },
      { phrase: "home / end", desc: "Start / end of line" },
      { phrase: "up N / down N", desc: "Move cursor N lines" },
      { phrase: "cursor left / cursor right", desc: "Move one character" },
      { phrase: "page up / page down", desc: "Scroll one page" }
    ]
  },
  {
    title: "Cache Pad",
    cmds: [
      { phrase: "recent N  (or: cache N)", desc: "Insert identifier from slot N (1\u201320)" },
      { phrase: "at sign recent N", desc: "Insert @identifier from slot N" },
      { phrase: "cache word", desc: "Push word at cursor into slot 1" },
      { phrase: "clear cache pad", desc: "Empty all slots" }
    ]
  },
  {
    title: "Transactions",
    cmds: [
      { phrase: "set mark", desc: "Save full restore point (buffer text + cursor)" },
      { phrase: "undo transaction", desc: "Revert to last set mark in one shot" },
      { phrase: "jump to mark", desc: "Navigate to mark without changing the buffer" }
    ]
  },
  {
    title: "Selection & Editing",
    cmds: [
      { phrase: "select word  (or: double select)", desc: "Select word at cursor" },
      { phrase: "select all", desc: "Select entire file" },
      { phrase: "delete word / delete N words", desc: "Delete words leftward" },
      { phrase: "delete line", desc: "Delete current line" },
      { phrase: "delete N chars", desc: "Delete N characters left" },
      { phrase: "delete to end", desc: "Delete to end of line" },
      { phrase: "copy / cut / paste", desc: "Clipboard operations" },
      { phrase: "undo / redo", desc: "Standard undo / redo" },
      { phrase: "comment line", desc: "Toggle line comment" }
    ]
  },
  {
    title: "File / Tabs",
    cmds: [
      { phrase: "save", desc: "Save current file" },
      { phrase: "save as", desc: "Save with new name / location" },
      { phrase: "new file", desc: "Open new untitled buffer" },
      { phrase: "close file", desc: "Close active editor (prompts if unsaved)" },
      { phrase: "next file", desc: "Cycle to next open tab" },
      { phrase: "previous file", desc: "Cycle to previous open tab" },
      { phrase: "reopen file", desc: "Reopen last closed editor" },
      { phrase: "format", desc: "Format document" }
    ]
  },
  {
    title: "AI Commands  (via LLM, ~5s)",
    cmds: [
      { phrase: "select [token name]", desc: "camelCase / snake_case aware \u2014 resolves spoken form to actual identifier", llm: true },
      { phrase: "insert [code description]", desc: "Generate and insert code at cursor", llm: true },
      { phrase: "[transform]  (with selection)", desc: 'e.g. "convert to snake case", "add error handling", "make async"', llm: true }
    ]
  }
];
var LANG_SECTIONS = {
  python: {
    title: "Python Templates",
    cmds: [
      // Fast-path templates — derived from commandData.ts (instant, no LLM wait)
      ...TEMPLATE_CMDS.filter((tc) => tc.lang === "python").map((tc) => ({ phrase: tc.phrase, desc: tc.desc })),
      // LLM-only (no fast-path equivalent)
      { phrase: "for each", desc: "for item in \u2026:", llm: true },
      { phrase: "class definition", desc: "class Name:", llm: true }
    ]
  },
  go: {
    title: "Go Templates",
    cmds: [
      // Fast-path templates — derived from commandData.ts
      ...TEMPLATE_CMDS.filter((tc) => tc.lang === "go").map((tc) => ({ phrase: tc.phrase, desc: tc.desc })),
      // LLM-only
      { phrase: "for loop", desc: "for i := 0; i < N; i++", llm: true },
      { phrase: "if statement", desc: "if condition {", llm: true },
      { phrase: "if error", desc: "if err != nil { return }", llm: true },
      { phrase: "function definition", desc: "func name(\u2026) \u2026", llm: true },
      { phrase: "struct definition", desc: "type Name struct {", llm: true },
      { phrase: "goroutine", desc: "go func() { \u2026 }()", llm: true },
      { phrase: "channel", desc: "make(chan Type)", llm: true }
    ]
  },
  "terraform-hcl": {
    title: "Terraform Templates  (via LLM)",
    cmds: [
      { phrase: "resource block", desc: 'resource "type" "name" {', llm: true },
      { phrase: "variable block", desc: 'variable "name" {', llm: true },
      { phrase: "output block", desc: 'output "name" {', llm: true },
      { phrase: "data block", desc: 'data "type" "name" {', llm: true },
      { phrase: "locals block", desc: "locals { \u2026 }", llm: true },
      { phrase: "module block", desc: 'module "name" {', llm: true }
    ]
  },
  yaml: {
    title: "YAML / k8s Templates  (via LLM)",
    cmds: [
      { phrase: "deployment", desc: "k8s Deployment manifest", llm: true },
      { phrase: "service", desc: "k8s Service manifest", llm: true },
      { phrase: "config map", desc: "k8s ConfigMap manifest", llm: true },
      { phrase: "list item", desc: "- key: value entry", llm: true }
    ]
  },
  typescript: {
    title: "TypeScript Templates  (via LLM)",
    cmds: [
      { phrase: "function definition", desc: "function or arrow function", llm: true },
      { phrase: "interface", desc: "interface Name {", llm: true },
      { phrase: "async function", desc: "async function name()", llm: true },
      { phrase: "try catch", desc: "try { \u2026 } catch (e)", llm: true },
      { phrase: "for of loop", desc: "for (const x of arr)", llm: true }
    ]
  },
  javascript: {
    title: "JavaScript Templates  (via LLM)",
    cmds: [
      { phrase: "function definition", desc: "function or arrow function", llm: true },
      { phrase: "async function", desc: "async function name()", llm: true },
      { phrase: "try catch", desc: "try { \u2026 } catch (e)", llm: true },
      { phrase: "for of loop", desc: "for (const x of arr)", llm: true }
    ]
  }
};
function renderSection(s) {
  const rows = s.cmds.map((c) => `
      <tr class="${c.llm ? "llm" : ""}">
        <td class="phrase"><code>${esc(c.phrase)}</code></td>
        <td class="desc">${esc(c.desc)}${c.llm ? ' <span class="badge">LLM</span>' : ""}</td>
      </tr>`).join("");
  return `
    <section>
      <h2>${esc(s.title)}</h2>
      <table><tbody>${rows}</tbody></table>
    </section>`;
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function buildHtml(lang) {
  const langSection = LANG_SECTIONS[lang];
  const sections = langSection ? [langSection, ...UNIVERSAL] : UNIVERSAL;
  const langLabel = lang ? ` \u2014 ${lang}` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PBV Commands${langLabel}</title>
<style>
  body { font-family: var(--vscode-font-family, -apple-system, sans-serif);
         font-size: 13px; color: var(--vscode-foreground, #ccc);
         background: var(--vscode-editor-background, #1e1e1e);
         margin: 0; padding: 16px 24px; }
  h1   { font-size: 16px; font-weight: 600; margin: 0 0 20px;
         border-bottom: 1px solid var(--vscode-panel-border, #444);
         padding-bottom: 8px; }
  h2   { font-size: 12px; font-weight: 700; letter-spacing: .06em;
         text-transform: uppercase; color: var(--vscode-textLink-foreground, #4ec9b0);
         margin: 20px 0 6px; }
  section { margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; }
  tr    { border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a); }
  tr:last-child { border-bottom: none; }
  tr.llm td.phrase code { color: var(--vscode-editorWarning-foreground, #cca700); }
  td    { padding: 4px 8px 4px 0; vertical-align: top; }
  td.phrase { width: 42%; white-space: nowrap; }
  td.desc   { color: var(--vscode-descriptionForeground, #999); }
  code  { font-family: var(--vscode-editor-font-family, monospace);
          font-size: 12px; color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }
  .badge { display: inline-block; font-size: 9px; padding: 1px 4px;
           background: var(--vscode-badge-background, #4d4d4d);
           color: var(--vscode-badge-foreground, #fff);
           border-radius: 3px; vertical-align: middle; margin-left: 4px; }
  #filter { width: 100%; box-sizing: border-box; padding: 5px 8px;
            margin-bottom: 16px; font-size: 12px;
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px; outline: none; }
  tr.hidden { display: none; }
</style>
</head>
<body>
<h1>PBV Commands${langLabel ? ` <small style="font-weight:400;color:#888">${esc(langLabel.slice(3))}</small>` : ""}</h1>
<input id="filter" type="text" placeholder="Filter commands\u2026" autofocus>
${sections.map(renderSection).join("\n")}
<script>
  const inp = document.getElementById('filter');
  inp.addEventListener('input', () => {
    const q = inp.value.toLowerCase();
    document.querySelectorAll('tr').forEach(tr => {
      tr.classList.toggle('hidden', q.length > 0 &&
        !tr.textContent.toLowerCase().includes(q));
    });
  });
</script>
</body>
</html>`;
}
function showCommandsPanel(_context) {
  const lang = vscode4.window.activeTextEditor?.document.languageId ?? "";
  const html = buildHtml(lang);
  const tmpFile = path.join(os.tmpdir(), "pbv-commands.html");
  fs.writeFileSync(tmpFile, html, "utf8");
  const browserApp = vscode4.workspace.getConfiguration("pbv").get("helpBrowser", "").trim();
  if (browserApp) {
    (0, import_child_process.execFile)("open", ["-a", browserApp, tmpFile]);
  } else {
    vscode4.env.openExternal(vscode4.Uri.file(tmpFile));
  }
}

// src/server.ts
var VSCODE_COMMANDS = {
  acceptCompletion: "acceptSelectedSuggestion",
  undo: "undo",
  redo: "redo",
  deleteToEndOfLine: "deleteAllRight",
  deleteLine: "editor.action.deleteLines",
  duplicateLine: "editor.action.copyLinesDownAction",
  selectAll: "editor.action.selectAll",
  cut: "editor.action.clipboardCutAction",
  copy: "editor.action.clipboardCopyAction",
  paste: "editor.action.clipboardPasteAction",
  save: "workbench.action.files.save",
  saveAs: "workbench.action.files.saveAs",
  newFile: "workbench.action.files.newUntitledFile",
  closeFile: "workbench.action.closeActiveEditor",
  nextFile: "workbench.action.nextEditor",
  previousFile: "workbench.action.previousEditor",
  reopenFile: "workbench.action.reopenClosedEditor",
  formatDocument: "editor.action.formatDocument",
  toggleLineComment: "editor.action.commentLine",
  find: "actions.find",
  replace: "editor.action.startFindReplaceAction",
  matchParen: "editor.action.jumpToBracket",
  cursorLeft: "cursorLeft",
  cursorRight: "cursorRight",
  cursorHome: "cursorHome",
  cursorEnd: "cursorEnd",
  cursorTop: "cursorTop",
  cursorBottom: "cursorBottom",
  pageUp: "scrollPageUp",
  pageDown: "scrollPageDown"
};
var IpcServer = class {
  constructor(port, cache, statusBar, context, claude) {
    this.cache = cache;
    this.statusBar = statusBar;
    this.context = context;
    this.claude = claude;
    this.sockets = /* @__PURE__ */ new Set();
    this.llmAbort = null;
    // Scroll / traversal state
    this.traversalMatches = null;
    this.traversalIndex = 0;
    this.port = port;
    this.server = net.createServer((socket) => this.onConnection(socket));
    this.server.listen(port, "127.0.0.1", () => {
      vscode5.window.setStatusBarMessage(`PBV: listening on :${port}`, 3e3);
    });
    this.server.on("error", (err) => {
      vscode5.window.showErrorMessage(`PBV IPC error: ${err.message}`);
    });
    context.subscriptions.push(
      vscode5.commands.registerCommand("pbv.scrollStep", () => this.scrollStep(1)),
      vscode5.commands.registerCommand("pbv.scrollStepBack", () => this.scrollStep(-1))
    );
  }
  // Push a message to all connected clients (used for cache-update events).
  broadcast(msg) {
    const line = JSON.stringify(msg) + "\n";
    for (const s of this.sockets) {
      if (!s.destroyed) s.write(line);
    }
  }
  dispose() {
    for (const s of this.sockets) s.destroy();
    this.server.close();
  }
  // vscode.Disposable
  [Symbol.dispose]() {
    this.dispose();
  }
  onConnection(socket) {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    let buffer = "";
    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.handle(trimmed, socket);
      }
    });
  }
  async handle(raw, socket) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.reply(socket, { ok: false, error: "malformed JSON" });
      return;
    }
    try {
      await this.dispatch(msg, socket);
      this.reply(socket, { ok: true });
    } catch (err) {
      this.reply(socket, { ok: false, error: String(err) });
    }
  }
  reply(socket, msg) {
    if (!socket.destroyed) socket.write(JSON.stringify(msg) + "\n");
  }
  editorSnapshot() {
    const editor = vscode5.window.activeTextEditor;
    const visible = editor?.visibleRanges[0];
    return {
      fileName: editor?.document.fileName.split("/").pop() ?? "untitled",
      language: editor?.document.languageId ?? "plaintext",
      content: editor?.document.getText() ?? "",
      cursorLine: (editor?.selection.active.line ?? 0) + 1,
      cursorChar: (editor?.selection.active.character ?? 0) + 1,
      selectedText: editor ? editor.document.getText(editor.selection) : "",
      cachePad: this.cache.getItems(),
      visibleStart: (visible?.start.line ?? 0) + 1,
      visibleEnd: (visible?.end.line ?? 0) + 1
    };
  }
  async dispatch(msg, _socket) {
    const editor = vscode5.window.activeTextEditor;
    switch (msg.cmd) {
      // --- Voice transcript — interpreted by Claude ---
      case "transcript": {
        this.llmAbort?.abort();
        this.llmAbort = null;
        const raw = msg.text;
        if (/^\s*(\[[A-Z_]+\]\s*)+$/.test(raw)) return;
        if (this.statusBar.getMode() === "dictation") {
          if (editor) {
            await editor.edit((eb) => eb.insert(editor.selection.active, raw + " "));
            vscode5.window.setStatusBarMessage(`$(keyboard) "${raw}"`, 1e4);
          }
          return;
        }
        const { commands: commands3, remainder } = fastInterpretMulti(raw);
        if (commands3.length > 0) {
          const labels = commands3.map((c) => this.describeCmd(c)).join(" | ");
          vscode5.window.setStatusBarMessage(`$(mic) "${raw}" \u2192 ${labels}`, 1e4);
          for (const cmd of commands3) {
            await this.dispatch(cmd, _socket);
          }
          if (!remainder) return;
        }
        const llmInput = remainder || raw;
        if (commands3.length > 0 && !remainder) return;
        if (!this.claude) {
          vscode5.window.showWarningMessage(
            "PBV: LLM client not initialized (check pbv.ollamaModel setting)"
          );
          return;
        }
        const snap = this.editorSnapshot();
        if (snap.selectedText) {
          const transformed = tryTransform(raw, snap.selectedText, snap.language);
          if (transformed !== null) {
            const editor2 = vscode5.window.activeTextEditor;
            if (editor2) {
              this.mark = { uri: editor2.document.uri.toString(), text: editor2.document.getText(), cursor: editor2.selection.active };
              editor2.selection = vscode5.window.activeTextEditor.selection;
              vscode5.window.setStatusBarMessage(`$(mic) "${raw}" \u2192 replaceSelection`, 1e4);
              await this.dispatch({ cmd: "replaceSelection", text: transformed }, _socket);
            }
            return;
          }
        }
        const savedSelection = vscode5.window.activeTextEditor?.selection;
        const abort = new AbortController();
        this.llmAbort = abort;
        const status = vscode5.window.setStatusBarMessage(`$(loading~spin) "${llmInput}" \u2192 thinking\u2026`);
        const command = await this.claude.interpret(llmInput, snap, abort.signal);
        status.dispose();
        this.llmAbort = null;
        if (abort.signal.aborted) return;
        if (!command) {
          vscode5.window.setStatusBarMessage(`$(mic) "${llmInput}" \u2192 (no command)`, 1e4);
          return;
        }
        if (command) {
          const cmd = command;
          vscode5.window.setStatusBarMessage(
            `$(mic) "${llmInput}" \u2192 ${this.describeCmd(cmd)}`,
            1e4
          );
          const isBufferEdit = cmd.cmd === "replaceSelection" || cmd.cmd === "insertText";
          if (snap.selectedText && !isBufferEdit) {
            vscode5.window.setStatusBarMessage(
              `$(warning) PBV: selection ignored \u2014 LLM returned "${cmd.cmd}" instead of an edit`,
              5e3
            );
            return;
          }
          if (isBufferEdit) {
            const editor2 = vscode5.window.activeTextEditor;
            if (editor2) {
              this.mark = {
                uri: editor2.document.uri.toString(),
                text: editor2.document.getText(),
                cursor: editor2.selection.active
              };
            }
            if (cmd.cmd === "replaceSelection" && savedSelection) {
              const editor3 = vscode5.window.activeTextEditor;
              if (editor3) editor3.selection = savedSelection;
            }
          }
          await this.dispatch(cmd, _socket);
        }
        return;
      }
      // --- Text insertion ---
      case "insertText": {
        if (!editor) return;
        const raw = msg.text;
        const cursor = raw.indexOf("{CURSOR}");
        const text = raw.replace("{CURSOR}", "");
        await editor.edit((eb) => eb.insert(editor.selection.active, text));
        if (cursor !== -1) {
          const inserted = editor.selection.active;
          const endOffset = editor.document.offsetAt(inserted);
          const markOffset = endOffset - (text.length - cursor);
          const markPos = editor.document.positionAt(markOffset);
          editor.selection = new vscode5.Selection(markPos, markPos);
        }
        break;
      }
      // --- Selection replacement (Claude code transforms) ---
      case "replaceSelection": {
        if (!editor) return;
        await editor.edit((eb) => eb.replace(editor.selection, msg.text));
        break;
      }
      // Verbatim insertion without LLM — replaces selection or inserts at cursor.
      // "dictate Word Frequency Counter" → inserts those exact words.
      case "dictateText": {
        if (!editor) return;
        const sel = editor.selection;
        await editor.edit(
          (eb) => sel.isEmpty ? eb.insert(sel.active, msg.text) : eb.replace(sel, msg.text)
        );
        break;
      }
      case "underlineLine": {
        if (!editor) break;
        const cursorLine = editor.selection.active.line;
        const aboveLine = cursorLine > 0 ? editor.document.lineAt(cursorLine - 1).text.trimEnd() : "";
        const len = aboveLine.length;
        const char = msg.char || "=";
        const text = len > 0 ? char.repeat(len) : char.repeat(20);
        const lineRange = editor.document.lineAt(cursorLine).range;
        await editor.edit((eb) => eb.replace(lineRange, text));
        break;
      }
      // --- Navigation ---
      case "gotoLine":
        await gotoLine(msg.line);
        break;
      case "gotoWordOnLine":
        await gotoWordOnLine(msg.word, msg.line);
        break;
      case "jumpToCharOnLine":
        await jumpToCharOnLine(msg.ordinal, msg.char, msg.line);
        break;
      case "selectToken":
        await selectToken(msg.token);
        break;
      case "selectRange":
        await selectRange(msg.startToken, msg.endToken);
        break;
      case "closeString": {
        if (!editor) return;
        await vscode5.commands.executeCommand("deleteLeft");
        await editor.edit((eb) => eb.insert(editor.selection.active, '"'));
        break;
      }
      // --- Scroll / traversal mode ---
      case "enterScrollMode":
        this.traversalMatches = null;
        this.statusBar.setScrollMode({ active: true, kind: "scroll", direction: msg.direction });
        await vscode5.commands.executeCommand("setContext", "pbv.scrolling", true);
        break;
      case "enterTraversalMode": {
        const ed = vscode5.window.activeTextEditor;
        if (ed) {
          this.navMark = {
            uri: ed.document.uri.toString(),
            cursor: ed.selection.active
          };
          const regex = traversalRegex(ed.document.languageId, msg.pattern);
          const text = ed.document.getText();
          const matches = [];
          let m;
          while ((m = regex.exec(text)) !== null) {
            matches.push({
              start: ed.document.positionAt(m.index),
              end: ed.document.positionAt(m.index + m[0].length)
            });
          }
          this.traversalMatches = matches;
          this.traversalIndex = 0;
          vscode5.window.setStatusBarMessage(
            `$(list-selection) PBV: traversing ${matches.length} match${matches.length === 1 ? "" : "es"}`,
            4e3
          );
        }
        this.statusBar.setScrollMode({ active: true, kind: "traverse" });
        await vscode5.commands.executeCommand("setContext", "pbv.scrolling", true);
        break;
      }
      case "exitScrollMode":
        this.traversalMatches = null;
        this.statusBar.setScrollMode({ active: false });
        await vscode5.commands.executeCommand("setContext", "pbv.scrolling", false);
        break;
      case "scrollStep":
        await this.scrollStep(msg.direction === "back" ? -1 : 1);
        break;
      case "cacheSelection": {
        const sel = vscode5.window.activeTextEditor;
        if (sel) {
          const text = sel.document.getText(sel.selection);
          if (text) this.cache.prependExplicit(text);
          else this.cache.cacheWordAtCursor();
        }
        break;
      }
      case "selectAndCacheToken": {
        await selectToken(msg.token);
        const ste = vscode5.window.activeTextEditor;
        if (ste) {
          const text = ste.document.getText(ste.selection);
          if (text) this.cache.prependExplicit(text);
        }
        break;
      }
      case "selectAndCacheRange": {
        await selectRange(msg.startToken, msg.endToken);
        const str = vscode5.window.activeTextEditor;
        if (str) {
          const text = str.document.getText(str.selection);
          if (text) this.cache.prependExplicit(text);
        }
        break;
      }
      case "cursorUp":
        for (let i = 0; i < (msg.n ?? 1); i++)
          await vscode5.commands.executeCommand("cursorUp");
        break;
      case "cursorDown":
        for (let i = 0; i < (msg.n ?? 1); i++)
          await vscode5.commands.executeCommand("cursorDown");
        break;
      // --- Cache pad ---
      case "insertCacheItem": {
        const sym = this.cache.insertAt(msg.index);
        if (sym && editor) {
          const text = (msg.prefix ?? "") + sym;
          await editor.edit((eb) => eb.insert(editor.selection.active, text));
        }
        break;
      }
      case "cacheCurrentWord":
        this.cache.cacheWordAtCursor();
        break;
      case "refreshCachePad":
        this.cache.unsuppress();
        if (editor) this.cache.absorbDocument(editor.document);
        break;
      case "evictCacheItem":
        this.cache.evict(msg.index);
        break;
      case "clearCachePad":
        this.cache.clear();
        break;
      case "syncCacheItems":
        this.cache.sync(msg.items);
        break;
      // --- Mode / readiness ---
      case "setMode":
        this.statusBar.setMode(msg.mode);
        break;
      case "setReady":
        this.statusBar.setReady(msg.ready);
        break;
      case "commandMode":
        this.statusBar.setMode("command");
        break;
      case "dictationMode":
        this.statusBar.setMode("dictation");
        break;
      // --- Voice-only UI access ---
      case "showCommands":
        showCommandsPanel(this.context);
        break;
      case "showCachePad":
        await vscode5.commands.executeCommand("pbv.cachePad.focus");
        break;
      // --- Transaction mark ---
      case "setMark": {
        if (!editor) return;
        this.mark = {
          uri: editor.document.uri.toString(),
          text: editor.document.getText(),
          cursor: editor.selection.active
        };
        vscode5.window.setStatusBarMessage("$(bookmark) PBV: mark set", 2e3);
        break;
      }
      case "jumpToMark": {
        if (!this.mark) {
          vscode5.window.showWarningMessage("PBV: no mark set");
          return;
        }
        if (!editor || editor.document.uri.toString() !== this.mark.uri) {
          vscode5.window.showWarningMessage("PBV: mark is from a different file");
          return;
        }
        editor.selection = new vscode5.Selection(this.mark.cursor, this.mark.cursor);
        editor.revealRange(
          new vscode5.Range(this.mark.cursor, this.mark.cursor),
          vscode5.TextEditorRevealType.InCenter
        );
        vscode5.window.setStatusBarMessage("$(bookmark) PBV: jumped to mark", 2e3);
        break;
      }
      // Navigation bookmark — not overwritten by buffer edits; auto-set on traversal entry.
      case "setNavMark": {
        if (!editor) return;
        this.navMark = {
          uri: editor.document.uri.toString(),
          cursor: editor.selection.active
        };
        vscode5.window.setStatusBarMessage("$(location) PBV: nav mark set", 2e3);
        break;
      }
      case "jumpToNavMark": {
        if (!this.navMark) {
          vscode5.window.showWarningMessage("PBV: no nav mark set");
          return;
        }
        if (!editor || editor.document.uri.toString() !== this.navMark.uri) {
          vscode5.window.showWarningMessage("PBV: nav mark is from a different file");
          return;
        }
        editor.selection = new vscode5.Selection(this.navMark.cursor, this.navMark.cursor);
        editor.revealRange(
          new vscode5.Range(this.navMark.cursor, this.navMark.cursor),
          vscode5.TextEditorRevealType.InCenter
        );
        vscode5.window.setStatusBarMessage("$(location) PBV: jumped to nav mark", 2e3);
        break;
      }
      case "selectWord": {
        if (!editor) return;
        const wordRange = editor.document.getWordRangeAtPosition(
          editor.selection.active
        );
        if (wordRange) editor.selection = new vscode5.Selection(
          wordRange.start,
          wordRange.end
        );
        break;
      }
      case "undoTransaction": {
        if (!this.mark) {
          vscode5.window.setStatusBarMessage("$(warning) PBV: no mark set", 3e3);
          return;
        }
        if (!editor || editor.document.uri.toString() !== this.mark.uri) {
          vscode5.window.setStatusBarMessage("$(warning) PBV: mark is from a different file", 3e3);
          return;
        }
        const { text, cursor } = this.mark;
        this.mark = void 0;
        const fullRange = new vscode5.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        await editor.edit((eb) => eb.replace(fullRange, text));
        editor.selection = new vscode5.Selection(cursor, cursor);
        vscode5.window.setStatusBarMessage("$(discard) PBV: transaction undone", 2e3);
        break;
      }
      // --- Undo grouping ---
      case "startUndoGroup":
        if (editor) await editor.edit((_eb) => {
        }, { undoStopBefore: true, undoStopAfter: false });
        break;
      case "endUndoGroup":
        if (editor) await editor.edit((_eb) => {
        }, { undoStopBefore: false, undoStopAfter: true });
        break;
      // --- Char / word deletion ---
      case "deleteChars":
        for (let i = 0; i < msg.n; i++)
          await vscode5.commands.executeCommand("deleteLeft");
        break;
      case "selectChars": {
        if (!editor) break;
        const start = editor.selection.active;
        const endOff = editor.document.offsetAt(start) + msg.n;
        const end = editor.document.positionAt(Math.min(endOff, editor.document.getText().length));
        editor.selection = new vscode5.Selection(start, end);
        break;
      }
      case "deleteWords":
        for (let i = 0; i < msg.n; i++)
          await vscode5.commands.executeCommand("deleteWordLeft");
        break;
      // --- Undo / redo ---
      case "undo":
        await vscode5.commands.executeCommand("undo");
        break;
      case "redo":
        await vscode5.commands.executeCommand("redo");
        break;
      // --- Everything else maps 1:1 to a VSCode command ---
      default: {
        const vcCmd = VSCODE_COMMANDS[msg.cmd];
        if (vcCmd) await vscode5.commands.executeCommand(vcCmd);
        break;
      }
    }
  }
  async scrollStep(direction) {
    if (this.traversalMatches && this.traversalMatches.length > 0) {
      this.traversalIndex = (this.traversalIndex + direction + this.traversalMatches.length) % this.traversalMatches.length;
      const match = this.traversalMatches[this.traversalIndex];
      const editor = vscode5.window.activeTextEditor;
      if (editor) {
        const selectOnTraverse = vscode5.workspace.getConfiguration("pbv").get("selectOnTraverse", false);
        editor.selection = selectOnTraverse ? new vscode5.Selection(match.start, match.end) : new vscode5.Selection(match.start, match.start);
        editor.revealRange(
          new vscode5.Range(match.start, match.end),
          vscode5.TextEditorRevealType.InCenter
        );
      }
    } else {
      await vscode5.commands.executeCommand(
        direction > 0 ? "scrollLineDown" : "scrollLineUp"
      );
    }
  }
  describeCmd(cmd) {
    const c = cmd;
    switch (cmd.cmd) {
      case "gotoLine":
        return `gotoLine ${c.line}`;
      case "gotoWordOnLine":
        return `word ${c.word} on line ${c.line}`;
      case "cursorUp":
        return `up ${c.n ?? 1}`;
      case "cursorDown":
        return `down ${c.n ?? 1}`;
      case "insertCacheItem":
        return `${c.prefix ?? ""}cache[${c.index}]`;
      case "jumpToCharOnLine":
        return `jump [${c.ordinal}] '${c.char}' line ${c.line}`;
      case "deleteChars":
        return `deleteChars ${c.n}`;
      case "deleteWords":
        return `deleteWords ${c.n}`;
      case "insertText":
        return `insertText "${String(c.text).slice(0, 30)}"`;
      case "replaceSelection":
        return `replaceSelection`;
      case "selectToken":
        return `selectToken "${c.token}"`;
      case "enterScrollMode":
        return `enterScrollMode(${c.direction})`;
      case "enterTraversalMode":
        return `enterTraversalMode`;
      case "exitScrollMode":
        return `exitScrollMode`;
      default:
        return cmd.cmd;
    }
  }
};
function traversalRegex(languageId, pattern) {
  if (pattern) return new RegExp(pattern, "gm");
  switch (languageId) {
    case "python":
      return /^\s*def\s+\w+/gm;
    case "go":
      return /^func\s+\w+/gm;
    case "typescript":
    case "javascript":
      return /^(?:export\s+)?(?:async\s+)?function\s+\w+/gm;
    case "rust":
      return /^(?:pub\s+)?fn\s+\w+/gm;
    default:
      return /^[^\s#\/\*].*[:{]\s*$/gm;
  }
}

// src/claudeClient.ts
var vscode6 = __toESM(require("vscode"));
var SYSTEM_PROMPT = 'You are a voice coding assistant. Map each utterance to exactly one JSON command object. If a "Selected code:" block is present, the utterance is a transformation request \u2014 return replaceSelection with the transformed code.';
var FEW_SHOT = [
  { role: "user", content: 'Utterance: "set mark"' },
  { role: "assistant", content: '{"cmd":"setMark"}' },
  { role: "user", content: 'Utterance: "undo transaction"' },
  { role: "assistant", content: '{"cmd":"undoTransaction"}' },
  { role: "user", content: 'Utterance: "cache 2"' },
  { role: "assistant", content: '{"cmd":"insertCacheItem","index":2}' },
  // camelCase / snake_case aware selection — resolve spoken form to actual token in excerpt
  { role: "user", content: 'Utterance: "select my variable name"\nLanguage: python\nContent excerpt: result = myVariableName + offset' },
  { role: "assistant", content: '{"cmd":"selectToken","token":"myVariableName"}' },
  { role: "user", content: 'Utterance: "select output file name"\nLanguage: python\nContent excerpt: open(output_file_name, "r")' },
  { role: "assistant", content: '{"cmd":"selectToken","token":"output_file_name"}' },
  // selectRange — "select range X through Y" selects from X to end of Y (works in comments too)
  { role: "user", content: 'Utterance: "select range score through ago"\nLanguage: markdown\nContent excerpt: Four score and seven years ago our fathers' },
  { role: "assistant", content: '{"cmd":"selectRange","startToken":"score","endToken":"ago"}' },
  { role: "user", content: 'Utterance: "select range raises through error"\nLanguage: python\nContent excerpt: # raises ValueError if input is not a valid error' },
  { role: "assistant", content: '{"cmd":"selectRange","startToken":"raises","endToken":"error"}' },
  // selectAndCache — select text AND push it to the cache pad in one step
  { role: "user", content: 'Utterance: "select and cache gig through flag"\nLanguage: python\nContent excerpt: "gig_worker_flag": False,' },
  { role: "assistant", content: '{"cmd":"selectAndCacheRange","startToken":"gig","endToken":"flag"}' },
  { role: "user", content: 'Utterance: "select and cache triage completed"\nLanguage: python\nContent excerpt: triage_completed = check_status()' },
  { role: "assistant", content: '{"cmd":"selectAndCacheToken","token":"triage_completed"}' }
];
var OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    cmd: {
      type: "string",
      enum: [
        "insertText",
        "replaceSelection",
        "gotoLine",
        "gotoWordOnLine",
        "cursorUp",
        "cursorDown",
        "cursorLeft",
        "cursorRight",
        "cursorHome",
        "cursorEnd",
        "cursorTop",
        "cursorBottom",
        "pageUp",
        "pageDown",
        "selectToken",
        "selectRange",
        "cacheSelection",
        "selectAndCacheToken",
        "selectAndCacheRange",
        "insertCacheItem",
        "deleteChars",
        "deleteWords",
        "deleteLine",
        "deleteToEndOfLine",
        "setMark",
        "undoTransaction",
        "undo",
        "redo",
        "save",
        "formatDocument",
        "toggleLineComment",
        "selectAll",
        "copy",
        "cut",
        "paste"
      ]
    },
    line: { type: "number" },
    word: { type: "number" },
    text: { type: "string" },
    token: { type: "string" },
    startToken: { type: "string" },
    endToken: { type: "string" },
    n: { type: "number" },
    index: { type: "number" }
  },
  required: ["cmd"]
};
var ClaudeClient = class {
  constructor(model, baseUrl = "http://localhost:11434") {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async interpret(transcript, snap, signal) {
    const excerpt = windowForLines(snap.content, snap.visibleStart, snap.visibleEnd);
    const parts = [
      `Language: ${snap.language}`,
      `Cursor: line ${snap.cursorLine}, char ${snap.cursorChar}`,
      `Cache pad: ${snap.cachePad.length ? snap.cachePad.join(", ") : "(empty)"}`,
      `Content excerpt:
${excerpt}`,
      `Utterance: "${transcript}"`
    ];
    if (snap.selectedText) {
      parts.push(`Selected code:
${snap.selectedText}`);
    }
    const userMsg = parts.join("\n");
    const messages = [
      ...FEW_SHOT,
      { role: "user", content: userMsg }
    ];
    const timeout = AbortSignal.timeout(1e4);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: combined,
        body: JSON.stringify({
          model: this.model,
          system: SYSTEM_PROMPT,
          messages,
          stream: false,
          format: OUTPUT_SCHEMA,
          options: { temperature: 0, num_predict: 60 }
        })
      });
      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      return JSON.parse(data.message.content.trim());
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") return null;
      if (name === "TimeoutError") {
        vscode6.window.setStatusBarMessage("$(warning) PBV: LLM timed out (Ollama took >10 s)", 6e3);
      } else {
        vscode6.window.setStatusBarMessage(`$(warning) PBV: LLM error \u2014 ${err}`, 8e3);
      }
      return null;
    }
  }
};
function windowForLines(content, startLine, endLine) {
  const lines = content.split("\n");
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, endLine);
  return lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join("\n");
}

// src/extension.ts
function activate(context) {
  const config = vscode7.workspace.getConfiguration("pbv");
  const port = config.get("port", 7890);
  const maxItems = config.get("maxCacheItems", 20);
  const ollamaModel = config.get("ollamaModel", "qwen2.5:3b");
  const ollamaUrl = config.get("ollamaUrl", "http://localhost:11434");
  const statusBar = new ModeStatusBar();
  let broadcastFn = () => {
  };
  const cache = new CachePad(maxItems, (msg) => broadcastFn(msg));
  const claude = new ClaudeClient(ollamaModel, ollamaUrl);
  const server = new IpcServer(port, cache, statusBar, context, claude);
  broadcastFn = (msg) => server.broadcast(msg);
  const treeView = vscode7.window.createTreeView("pbv.cachePad", {
    treeDataProvider: cache,
    showCollapseAll: false
  });
  const cmds = [
    vscode7.commands.registerCommand("pbv.refreshCachePad", () => {
      const editor = vscode7.window.activeTextEditor;
      if (editor) cache.absorbDocument(editor.document);
    }),
    vscode7.commands.registerCommand("pbv.cacheCurrentWord", () => {
      cache.cacheWordAtCursor();
    }),
    vscode7.commands.registerCommand("pbv.clearCachePad", () => {
      cache.clear();
    }),
    vscode7.commands.registerCommand("pbv.showCommands", () => {
      showCommandsPanel(context);
    })
  ];
  const editListener = vscode7.workspace.onDidChangeTextDocument((event) => {
    if (event.document === vscode7.window.activeTextEditor?.document) {
      cache.absorbEdit(event);
    }
  });
  const editorListener = vscode7.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) cache.absorbDocument(editor.document);
  });
  if (vscode7.window.activeTextEditor) {
    cache.absorbDocument(vscode7.window.activeTextEditor.document);
  }
  context.subscriptions.push(statusBar, treeView, server, editListener, editorListener, ...cmds);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
