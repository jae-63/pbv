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
var vscode6 = __toESM(require("vscode"));

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
var RULES = [
  // Navigation — word on line (must be before bare "line N" rule)
  // "word 3 on line 68" / "go to word 3 on line 68"
  {
    pattern: /^(?:go\s+to\s+)?word\s+(\d+)\s+(?:on\s+)?line\s+(\d+)$/i,
    build: (m) => ({ cmd: "gotoWordOnLine", word: n(m[1]), line: n(m[2]) })
  },
  // "go to 3rd word on line 68" / "3rd word on line 68"
  {
    pattern: /^(?:go\s+to\s+)?(\d+)(?:st|nd|rd|th)\s+word\s+(?:on\s+)?line\s+(\d+)$/i,
    build: (m) => ({ cmd: "gotoWordOnLine", word: n(m[1]), line: n(m[2]) })
  },
  // Navigation — line
  {
    pattern: /^(?:go\s+to\s+|goto\s+|jump\s+to\s+)?line\s+(\d+)$/i,
    build: (m) => ({ cmd: "gotoLine", line: n(m[1]) })
  },
  // Navigation — cursor up/down with count
  {
    pattern: /^(?:cursor\s+)?up\s+(\d+)(?:\s+lines?)?$/i,
    build: (m) => ({ cmd: "cursorUp", n: n(m[1]) })
  },
  {
    pattern: /^(?:cursor\s+)?up$/i,
    build: (_) => ({ cmd: "cursorUp", n: 1 })
  },
  {
    pattern: /^(?:cursor\s+)?down\s+(\d+)(?:\s+lines?)?$/i,
    build: (m) => ({ cmd: "cursorDown", n: n(m[1]) })
  },
  {
    pattern: /^(?:cursor\s+)?down$/i,
    build: (_) => ({ cmd: "cursorDown", n: 1 })
  },
  // Navigation — cursor movement
  { pattern: /^cursor\s+left$/i, build: (_) => ({ cmd: "cursorLeft" }) },
  { pattern: /^cursor\s+right$/i, build: (_) => ({ cmd: "cursorRight" }) },
  { pattern: /^(?:cursor\s+)?home$/i, build: (_) => ({ cmd: "cursorHome" }) },
  { pattern: /^(?:cursor\s+)?end(?:\s+of\s+line)?$/i, build: (_) => ({ cmd: "cursorEnd" }) },
  { pattern: /^(?:(?:cursor|go)\s+to\s+)?top$/i, build: (_) => ({ cmd: "cursorTop" }) },
  { pattern: /^(?:(?:cursor|go)\s+to\s+)?bottom$/i, build: (_) => ({ cmd: "cursorBottom" }) },
  { pattern: /^page\s+up$/i, build: (_) => ({ cmd: "pageUp" }) },
  { pattern: /^page\s+down$/i, build: (_) => ({ cmd: "pageDown" }) },
  // Cache pad
  {
    pattern: /^cache\s+(\d+)$/i,
    build: (m) => ({ cmd: "insertCacheItem", index: n(m[1]) })
  },
  {
    pattern: /^insert\s+cache(?:\s+item)?\s+(\d+)$/i,
    build: (m) => ({ cmd: "insertCacheItem", index: n(m[1]) })
  },
  // Deletion
  {
    pattern: /^delete\s+(?:this\s+)?line$/i,
    build: (_) => ({ cmd: "deleteLine" })
  },
  {
    pattern: /^delete\s+(\d+)\s+words?$/i,
    build: (m) => ({ cmd: "deleteWords", n: n(m[1]) })
  },
  {
    pattern: /^delete\s+(?:a\s+)?word$/i,
    build: (_) => ({ cmd: "deleteWords", n: 1 })
  },
  {
    pattern: /^delete\s+(\d+)\s+chars?(?:acters?)?$/i,
    build: (m) => ({ cmd: "deleteChars", n: n(m[1]) })
  },
  {
    pattern: /^delete\s+(?:to\s+)?end(?:\s+of\s+(?:the\s+)?line)?$/i,
    build: (_) => ({ cmd: "deleteToEndOfLine" })
  },
  // Transactions
  { pattern: /^set\s+mark$/i, build: (_) => ({ cmd: "setMark" }) },
  { pattern: /^undo\s+transaction$/i, build: (_) => ({ cmd: "undoTransaction" }) },
  // Document ops
  {
    pattern: /^save(?:\s+(?:the\s+)?(?:file|document))?$/i,
    build: (_) => ({ cmd: "save" })
  },
  { pattern: /^undo(?:\s+that)?$/i, build: (_) => ({ cmd: "undo" }) },
  { pattern: /^redo$/i, build: (_) => ({ cmd: "redo" }) },
  {
    pattern: /^format(?:\s+(?:the\s+)?(?:file|document))?$/i,
    build: (_) => ({ cmd: "formatDocument" })
  },
  {
    pattern: /^(?:toggle\s+)?comment(?:\s+line)?$/i,
    build: (_) => ({ cmd: "toggleLineComment" })
  },
  { pattern: /^select\s+all$/i, build: (_) => ({ cmd: "selectAll" }) },
  { pattern: /^copy$/i, build: (_) => ({ cmd: "copy" }) },
  { pattern: /^cut$/i, build: (_) => ({ cmd: "cut" }) },
  { pattern: /^paste$/i, build: (_) => ({ cmd: "paste" }) }
];
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
function normalizeNumbers(text) {
  let t = text.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, tens, ones) => String((WORD_NUMBERS[tens.toLowerCase()] ?? 0) + (WORD_NUMBERS[ones.toLowerCase()] ?? 0))
  );
  t = t.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
    (w) => String(WORD_NUMBERS[w.toLowerCase()] ?? w)
  );
  return t;
}
function fastInterpret(utterance) {
  const text = normalizeNumbers(utterance.trim().replace(/[.,!?]+$/, ""));
  for (const { pattern, build } of RULES) {
    const m = text.match(pattern);
    if (m) return build(m);
  }
  return null;
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
        const fast = fastInterpret(raw);
        if (fast) {
          vscode4.window.setStatusBarMessage(
            `$(mic) "${raw}" \u2192 ${this.describeCmd(fast)}`,
            5e3
          );
          await this.dispatch(fast, _socket);
          return;
        }
        const snap = this.editorSnapshot();
        if (snap.selectedText) {
          const transformed = tryTransform(raw, snap.selectedText, snap.language);
          if (transformed !== null) {
            const editor2 = vscode4.window.activeTextEditor;
            if (editor2) {
              this.mark = { uri: editor2.document.uri.toString(), text: editor2.document.getText(), cursor: editor2.selection.active };
              editor2.selection = vscode4.window.activeTextEditor.selection;
              vscode4.window.setStatusBarMessage(`$(mic) "${raw}" \u2192 replaceSelection`, 5e3);
              await this.dispatch({ cmd: "replaceSelection", text: transformed }, _socket);
            }
            return;
          }
        }
        const savedSelection = vscode4.window.activeTextEditor?.selection;
        const abort = new AbortController();
        this.llmAbort = abort;
        const status = vscode4.window.setStatusBarMessage(`$(loading~spin) "${raw}" \u2192 thinking\u2026`);
        const command = await this.claude.interpret(raw, snap, abort.signal);
        status.dispose();
        this.llmAbort = null;
        if (abort.signal.aborted) return;
        if (!command) {
          vscode4.window.setStatusBarMessage(`$(mic) "${raw}" \u2192 (no command)`, 5e3);
          return;
        }
        if (command) {
          const cmd = command;
          vscode4.window.setStatusBarMessage(
            `$(mic) "${raw}" \u2192 ${this.describeCmd(cmd)}`,
            5e3
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
          await editor.edit((eb) => eb.insert(editor.selection.active, sym));
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
        return `cache[${c.index}]`;
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
  { role: "assistant", content: '{"cmd":"insertCacheItem","index":2}' }
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

// src/extension.ts
function activate(context) {
  const config = vscode6.workspace.getConfiguration("voiceCoder");
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
  const treeView = vscode6.window.createTreeView("voiceCoder.cachePad", {
    treeDataProvider: cache,
    showCollapseAll: false
  });
  const cmds = [
    vscode6.commands.registerCommand("voiceCoder.refreshCachePad", () => {
      const editor = vscode6.window.activeTextEditor;
      if (editor) cache.absorbDocument(editor.document);
    }),
    vscode6.commands.registerCommand("voiceCoder.cacheCurrentWord", () => {
      cache.cacheWordAtCursor();
    }),
    vscode6.commands.registerCommand("voiceCoder.clearCachePad", () => {
      cache.clear();
    })
  ];
  const editListener = vscode6.workspace.onDidChangeTextDocument((event) => {
    if (event.document === vscode6.window.activeTextEditor?.document) {
      cache.absorbEdit(event);
    }
  });
  const editorListener = vscode6.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) cache.absorbDocument(editor.document);
  });
  if (vscode6.window.activeTextEditor) {
    cache.absorbDocument(vscode6.window.activeTextEditor.document);
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
