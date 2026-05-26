"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachePad = exports.CachePadItem = void 0;
const vscode = __importStar(require("vscode"));
// Words that should never auto-enter the cache regardless of language.
// Language-specific keyword lists are loaded from the vocab YAML at runtime (future).
// For now, a broad union covers Python + Go + Terraform + k8s field names.
const STOP_WORDS = new Set([
    'if', 'else', 'elif', 'for', 'while', 'with', 'try', 'except', 'finally',
    'def', 'class', 'return', 'yield', 'import', 'from', 'as', 'pass', 'break',
    'continue', 'raise', 'lambda', 'del', 'global', 'nonlocal', 'assert',
    'async', 'await', 'not', 'and', 'or', 'in', 'is',
    'func', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan',
    'go', 'defer', 'select', 'range', 'switch', 'case', 'default', 'fallthrough',
    'package', 'nil', 'true', 'false', 'True', 'False', 'None',
    'resource', 'data', 'variable', 'output', 'locals', 'module', 'provider',
    'apiVersion', 'kind', 'metadata', 'spec', 'status', 'name', 'namespace',
]);
const IDENTIFIER_RE = /\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g;
class CachePadItem extends vscode.TreeItem {
    constructor(index, // 1-based display index
    symbol, recent) {
        super(`${index}.  ${symbol}`, vscode.TreeItemCollapsibleState.None);
        this.index = index;
        this.symbol = symbol;
        this.recent = recent;
        this.description = '';
        this.tooltip = symbol;
        this.contextValue = 'cachePadItem';
        if (recent) {
            this.iconPath = new vscode.ThemeIcon('symbol-variable', new vscode.ThemeColor('charts.yellow'));
        }
    }
}
exports.CachePadItem = CachePadItem;
class CachePad {
    constructor(maxItems, broadcast) {
        this.items = [];
        this.recentSet = new Set(); // items inserted within last 5 s
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.maxItems = maxItems;
        this.broadcast = broadcast;
    }
    // --- TreeDataProvider ------------------------------------------------
    getTreeItem(element) { return element; }
    getChildren() {
        return this.items.map((sym, i) => new CachePadItem(i + 1, sym, this.recentSet.has(sym)));
    }
    // --- Public API -------------------------------------------------------
    getItems() { return [...this.items]; }
    prepend(symbol) {
        if (STOP_WORDS.has(symbol))
            return;
        if (symbol.length < 2)
            return;
        this.items = [symbol, ...this.items.filter(s => s !== symbol)].slice(0, this.maxItems);
        this.markRecent(symbol);
        this.refresh();
    }
    insertAt(index) {
        const sym = this.items[index - 1]; // 1-based
        if (sym)
            this.markRecent(sym);
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
            if (!STOP_WORDS.has(m[0]))
                found.push(m[0]);
        }
        // Deduplicate, preserving first occurrence order; take last maxItems
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
        if (!editor)
            return;
        const range = editor.document.getWordRangeAtPosition(editor.selection.active, IDENTIFIER_RE);
        if (!range)
            return;
        const word = editor.document.getText(range);
        this.prepend(word);
    }
    // --- Private ----------------------------------------------------------
    markRecent(symbol) {
        this.recentSet.add(symbol);
        setTimeout(() => {
            this.recentSet.delete(symbol);
            this._onDidChangeTreeData.fire(undefined);
        }, 5000);
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
        this.broadcast({ event: 'cacheUpdate', items: this.items });
    }
}
exports.CachePad = CachePad;
//# sourceMappingURL=cachepad.js.map