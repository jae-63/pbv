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
    this.refresh();
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
var ModeStatusBar = class {
  constructor() {
    this.mode = "command";
    this.ready = false;
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
  dispose() {
    this.item.dispose();
  }
  [Symbol.dispose]() {
    this.dispose();
  }
  render() {
    if (this.mode === "command") {
      this.item.text = "$(mic) COMMAND";
      if (this.ready) {
        this.item.backgroundColor = new vscode2.ThemeColor("statusBarItem.warningBackground");
        this.item.tooltip = "Voice Coder: listening \u2014 utterances are interpreted as commands";
      } else {
        this.item.backgroundColor = new vscode2.ThemeColor("statusBarItem.errorBackground");
        this.item.tooltip = "Voice Coder: initializing speech recognition\u2026";
      }
    } else {
      this.item.text = "$(keyboard) DICTATION";
      this.item.backgroundColor = void 0;
      this.item.tooltip = "Voice Coder: dictation mode \u2014 speech is inserted as text";
    }
  }
};

// src/server.ts
var net = __toESM(require("net"));
var vscode4 = __toESM(require("vscode"));

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
async function selectToken(token) {
  const editor = vscode3.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const text = doc.getText();
  const cursor = doc.offsetAt(editor.selection.active);
  const searchFrom = (startOffset) => {
    const idx = text.indexOf(token, startOffset);
    return idx;
  };
  let found = searchFrom(cursor);
  if (found === -1) found = searchFrom(0);
  if (found === -1) return;
  const startPos = doc.positionAt(found);
  const endPos = doc.positionAt(found + token.length);
  editor.selection = new vscode3.Selection(startPos, endPos);
  editor.revealRange(new vscode3.Range(startPos, endPos), vscode3.TextEditorRevealType.InCenter);
}

// src/fastPath.ts
var n = (s) => parseInt(s, 10);
function rule(src, build) {
  return {
    exact: new RegExp("^(?:" + src + ")$", "i"),
    prefix: new RegExp("^(?:" + src + ")(?=\\s|$)", "i"),
    build
  };
}
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
  rule("cursor\\s+left", (_) => ({ cmd: "cursorLeft" })),
  rule("cursor\\s+right", (_) => ({ cmd: "cursorRight" })),
  rule("(?:cursor\\s+)?home", (_) => ({ cmd: "cursorHome" })),
  rule("(?:cursor\\s+)?end(?:\\s+of\\s+line)?", (_) => ({ cmd: "cursorEnd" })),
  rule("(?:(?:cursor|go)\\s+to\\s+)?top", (_) => ({ cmd: "cursorTop" })),
  rule("(?:(?:cursor|go)\\s+to\\s+)?bottom", (_) => ({ cmd: "cursorBottom" })),
  rule("page\\s+up", (_) => ({ cmd: "pageUp" })),
  rule("page\\s+down", (_) => ({ cmd: "pageDown" })),
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
  // Transactions & mark navigation
  rule("set\\s+mark", (_) => ({ cmd: "setMark" })),
  rule("undo\\s+transaction", (_) => ({ cmd: "undoTransaction" })),
  rule("jump\\s+to\\s+mark", (_) => ({ cmd: "jumpToMark" })),
  // Word selection & bracket matching
  rule("select\\s+word", (_) => ({ cmd: "selectWord" })),
  rule("double\\s+select", (_) => ({ cmd: "selectWord" })),
  rule(
    "match\\s+(?:this\\s+)?paren(?:thesis)?|match\\s+bracket",
    (_) => ({ cmd: "matchParen" })
  ),
  // Document ops
  rule("save(?:\\s+(?:the\\s+)?(?:file|document))?", (_) => ({ cmd: "save" })),
  rule("undo(?:\\s+that)?", (_) => ({ cmd: "undo" })),
  rule("redo", (_) => ({ cmd: "redo" })),
  rule("format(?:\\s+(?:the\\s+)?(?:file|document))?", (_) => ({ cmd: "formatDocument" })),
  rule("(?:toggle\\s+)?comment(?:\\s+line)?", (_) => ({ cmd: "toggleLineComment" })),
  rule("select\\s+all", (_) => ({ cmd: "selectAll" })),
  rule("copy", (_) => ({ cmd: "copy" })),
  rule("cut", (_) => ({ cmd: "cut" })),
  rule("paste", (_) => ({ cmd: "paste" }))
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

// src/server.ts
var VSCODE_COMMANDS = {
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
  constructor(port, cache, statusBar, claude) {
    this.cache = cache;
    this.statusBar = statusBar;
    this.claude = claude;
    this.sockets = /* @__PURE__ */ new Set();
    this.llmAbort = null;
    this.port = port;
    this.server = net.createServer((socket) => this.onConnection(socket));
    this.server.listen(port, "127.0.0.1", () => {
      vscode4.window.setStatusBarMessage(`Voice Coder: listening on :${port}`, 3e3);
    });
    this.server.on("error", (err) => {
      vscode4.window.showErrorMessage(`Voice Coder IPC error: ${err.message}`);
    });
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
    const editor = vscode4.window.activeTextEditor;
    return {
      fileName: editor?.document.fileName.split("/").pop() ?? "untitled",
      language: editor?.document.languageId ?? "plaintext",
      content: editor?.document.getText() ?? "",
      cursorLine: (editor?.selection.active.line ?? 0) + 1,
      cursorChar: (editor?.selection.active.character ?? 0) + 1,
      selectedText: editor ? editor.document.getText(editor.selection) : "",
      cachePad: this.cache.getItems()
    };
  }
  async dispatch(msg, _socket) {
    const editor = vscode4.window.activeTextEditor;
    switch (msg.cmd) {
      // --- Voice transcript — interpreted by Claude ---
      case "transcript": {
        this.llmAbort?.abort();
        this.llmAbort = null;
        if (!this.claude) {
          vscode4.window.showWarningMessage(
            "Voice Coder: LLM client not initialized (check voiceCoder.ollamaModel setting)"
          );
          return;
        }
        const raw = msg.text;
        const { commands: commands3, remainder } = fastInterpretMulti(raw);
        if (commands3.length > 0) {
          const labels = commands3.map((c) => this.describeCmd(c)).join(" | ");
          vscode4.window.setStatusBarMessage(`$(mic) "${raw}" \u2192 ${labels}`, 1e4);
          for (const cmd of commands3) {
            await this.dispatch(cmd, _socket);
          }
          if (!remainder) return;
        }
        const llmInput = remainder || raw;
        if (commands3.length > 0 && !remainder) return;
        const snap = this.editorSnapshot();
        if (snap.selectedText) {
          const transformed = tryTransform(raw, snap.selectedText, snap.language);
          if (transformed !== null) {
            const editor2 = vscode4.window.activeTextEditor;
            if (editor2) {
              this.mark = { uri: editor2.document.uri.toString(), text: editor2.document.getText(), cursor: editor2.selection.active };
              editor2.selection = vscode4.window.activeTextEditor.selection;
              vscode4.window.setStatusBarMessage(`$(mic) "${raw}" \u2192 replaceSelection`, 1e4);
              await this.dispatch({ cmd: "replaceSelection", text: transformed }, _socket);
            }
            return;
          }
        }
        const savedSelection = vscode4.window.activeTextEditor?.selection;
        const abort = new AbortController();
        this.llmAbort = abort;
        const status = vscode4.window.setStatusBarMessage(`$(loading~spin) "${llmInput}" \u2192 thinking\u2026`);
        const command = await this.claude.interpret(llmInput, snap, abort.signal);
        status.dispose();
        this.llmAbort = null;
        if (abort.signal.aborted) return;
        if (!command) {
          vscode4.window.setStatusBarMessage(`$(mic) "${llmInput}" \u2192 (no command)`, 1e4);
          return;
        }
        if (command) {
          const cmd = command;
          vscode4.window.setStatusBarMessage(
            `$(mic) "${llmInput}" \u2192 ${this.describeCmd(cmd)}`,
            1e4
          );
          const isBufferEdit = cmd.cmd === "replaceSelection" || cmd.cmd === "insertText";
          if (snap.selectedText && !isBufferEdit) {
            vscode4.window.showWarningMessage(
              `Voice Coder: selection ignored \u2014 LLM returned "${cmd.cmd}" instead of an edit`
            );
            return;
          }
          if (isBufferEdit) {
            const editor2 = vscode4.window.activeTextEditor;
            if (editor2) {
              this.mark = {
                uri: editor2.document.uri.toString(),
                text: editor2.document.getText(),
                cursor: editor2.selection.active
              };
            }
            if (cmd.cmd === "replaceSelection" && savedSelection) {
              const editor3 = vscode4.window.activeTextEditor;
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
          editor.selection = new vscode4.Selection(markPos, markPos);
        }
        break;
      }
      // --- Selection replacement (Claude code transforms) ---
      case "replaceSelection": {
        if (!editor) return;
        await editor.edit((eb) => eb.replace(editor.selection, msg.text));
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
      case "cursorUp":
        for (let i = 0; i < (msg.n ?? 1); i++)
          await vscode4.commands.executeCommand("cursorUp");
        break;
      case "cursorDown":
        for (let i = 0; i < (msg.n ?? 1); i++)
          await vscode4.commands.executeCommand("cursorDown");
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
      // --- Transaction mark ---
      case "setMark": {
        if (!editor) return;
        this.mark = {
          uri: editor.document.uri.toString(),
          text: editor.document.getText(),
          cursor: editor.selection.active
        };
        vscode4.window.setStatusBarMessage("$(bookmark) Voice Coder: mark set", 2e3);
        break;
      }
      case "jumpToMark": {
        if (!this.mark) {
          vscode4.window.showWarningMessage("Voice Coder: no mark set");
          return;
        }
        if (!editor || editor.document.uri.toString() !== this.mark.uri) {
          vscode4.window.showWarningMessage("Voice Coder: mark is from a different file");
          return;
        }
        editor.selection = new vscode4.Selection(this.mark.cursor, this.mark.cursor);
        editor.revealRange(
          new vscode4.Range(this.mark.cursor, this.mark.cursor),
          vscode4.TextEditorRevealType.InCenter
        );
        vscode4.window.setStatusBarMessage("$(bookmark) Voice Coder: jumped to mark", 2e3);
        break;
      }
      case "selectWord": {
        if (!editor) return;
        const wordRange = editor.document.getWordRangeAtPosition(
          editor.selection.active
        );
        if (wordRange) editor.selection = new vscode4.Selection(
          wordRange.start,
          wordRange.end
        );
        break;
      }
      case "undoTransaction": {
        if (!this.mark) {
          vscode4.window.showWarningMessage("Voice Coder: no mark set");
          return;
        }
        if (!editor || editor.document.uri.toString() !== this.mark.uri) {
          vscode4.window.showWarningMessage("Voice Coder: mark is from a different file");
          return;
        }
        const { text, cursor } = this.mark;
        this.mark = void 0;
        const fullRange = new vscode4.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        await editor.edit((eb) => eb.replace(fullRange, text));
        editor.selection = new vscode4.Selection(cursor, cursor);
        vscode4.window.setStatusBarMessage("$(discard) Voice Coder: transaction undone", 2e3);
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
          await vscode4.commands.executeCommand("deleteLeft");
        break;
      case "selectChars": {
        if (!editor) break;
        const start = editor.selection.active;
        const endOff = editor.document.offsetAt(start) + msg.n;
        const end = editor.document.positionAt(Math.min(endOff, editor.document.getText().length));
        editor.selection = new vscode4.Selection(start, end);
        break;
      }
      case "deleteWords":
        for (let i = 0; i < msg.n; i++)
          await vscode4.commands.executeCommand("deleteWordLeft");
        break;
      // --- Undo / redo ---
      case "undo":
        await vscode4.commands.executeCommand("undo");
        break;
      case "redo":
        await vscode4.commands.executeCommand("redo");
        break;
      // --- Everything else maps 1:1 to a VSCode command ---
      default: {
        const vcCmd = VSCODE_COMMANDS[msg.cmd];
        if (vcCmd) await vscode4.commands.executeCommand(vcCmd);
        break;
      }
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
      default:
        return cmd.cmd;
    }
  }
};

// src/claudeClient.ts
var vscode5 = __toESM(require("vscode"));
var SYSTEM_PROMPT = 'You are a voice coding assistant. Map each utterance to exactly one JSON command object. If a "Selected code:" block is present, the utterance is a transformation request \u2014 return replaceSelection with the transformed code.';
var FEW_SHOT = [
  { role: "user", content: 'Utterance: "set mark"' },
  { role: "assistant", content: '{"cmd":"setMark"}' },
  { role: "user", content: 'Utterance: "undo transaction"' },
  { role: "assistant", content: '{"cmd":"undoTransaction"}' },
  { role: "user", content: 'Utterance: "cache 2"' },
  { role: "assistant", content: '{"cmd":"insertCacheItem","index":2}' },
  // camelCase / snake_case aware selection — resolve spoken form to actual token
  { role: "user", content: 'Utterance: "select my variable name"\nLanguage: python\nContent excerpt: result = myVariableName + offset' },
  { role: "assistant", content: '{"cmd":"selectToken","token":"myVariableName"}' },
  { role: "user", content: 'Utterance: "select output file name"\nLanguage: python\nContent excerpt: open(output_file_name, "r")' },
  { role: "assistant", content: '{"cmd":"selectToken","token":"output_file_name"}' }
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
    const parts = [
      `Language: ${snap.language}`,
      `Cursor: line ${snap.cursorLine}, char ${snap.cursorChar}`,
      `Cache pad: ${snap.cachePad.length ? snap.cachePad.join(", ") : "(empty)"}`,
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
        vscode5.window.showWarningMessage("Voice Coder: LLM timed out (Ollama took >10 s)");
      } else {
        vscode5.window.showWarningMessage(`Voice Coder: LLM error \u2014 ${err}`);
      }
      return null;
    }
  }
};

// src/commandsPanel.ts
var vscode6 = __toESM(require("vscode"));
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
    title: "Document",
    cmds: [
      { phrase: "save", desc: "Save file" },
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
    title: "Python Templates  (via LLM)",
    cmds: [
      { phrase: "for loop", desc: "for i in range(\u2026):", llm: true },
      { phrase: "for each", desc: "for item in \u2026:", llm: true },
      { phrase: "if statement", desc: "if \u2026:", llm: true },
      { phrase: "while loop", desc: "while \u2026:", llm: true },
      { phrase: "function definition", desc: "def name(\u2026):", llm: true },
      { phrase: "class definition", desc: "class Name:", llm: true },
      { phrase: "try except", desc: "try / except block", llm: true },
      { phrase: "with statement", desc: "with \u2026 as \u2026:", llm: true }
    ]
  },
  go: {
    title: "Go Templates  (via LLM)",
    cmds: [
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
<title>VoiceCoder Commands${langLabel}</title>
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
<h1>VoiceCoder Commands${langLabel ? ` <small style="font-weight:400;color:#888">${esc(langLabel.slice(3))}</small>` : ""}</h1>
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
var panel;
function showCommandsPanel(context) {
  const lang = vscode6.window.activeTextEditor?.document.languageId ?? "";
  if (panel) {
    panel.reveal();
    panel.webview.html = buildHtml(lang);
    return;
  }
  panel = vscode6.window.createWebviewPanel(
    "voiceCoder.commands",
    "VoiceCoder Commands",
    vscode6.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = buildHtml(lang);
  panel.onDidDispose(() => {
    panel = void 0;
  }, null, context.subscriptions);
  context.subscriptions.push(
    vscode6.window.onDidChangeActiveTextEditor((e) => {
      if (!panel) return;
      const newLang = e?.document.languageId ?? "";
      if (newLang !== lang) panel.webview.html = buildHtml(newLang);
    })
  );
}

// src/extension.ts
function activate(context) {
  const config = vscode7.workspace.getConfiguration("voiceCoder");
  const port = config.get("port", 7890);
  const maxItems = config.get("maxCacheItems", 20);
  const ollamaModel = config.get("ollamaModel", "phi4-mini:latest");
  const ollamaUrl = config.get("ollamaUrl", "http://localhost:11434");
  const statusBar = new ModeStatusBar();
  let broadcastFn = () => {
  };
  const cache = new CachePad(maxItems, (msg) => broadcastFn(msg));
  const claude = new ClaudeClient(ollamaModel, ollamaUrl);
  const server = new IpcServer(port, cache, statusBar, claude);
  broadcastFn = (msg) => server.broadcast(msg);
  const treeView = vscode7.window.createTreeView("voiceCoder.cachePad", {
    treeDataProvider: cache,
    showCollapseAll: false
  });
  const cmds = [
    vscode7.commands.registerCommand("voiceCoder.refreshCachePad", () => {
      const editor = vscode7.window.activeTextEditor;
      if (editor) cache.absorbDocument(editor.document);
    }),
    vscode7.commands.registerCommand("voiceCoder.cacheCurrentWord", () => {
      cache.cacheWordAtCursor();
    }),
    vscode7.commands.registerCommand("voiceCoder.clearCachePad", () => {
      cache.clear();
    }),
    vscode7.commands.registerCommand("voiceCoder.showCommands", () => {
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
