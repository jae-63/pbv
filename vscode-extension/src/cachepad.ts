import * as vscode from 'vscode';

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

export class CachePadItem extends vscode.TreeItem {
    constructor(
        public readonly index: number,    // 1-based display index
        public readonly symbol: string,
        public readonly recent: boolean,  // highlighted if inserted in last N seconds
    ) {
        super(`${index}.  ${symbol}`, vscode.TreeItemCollapsibleState.None);
        this.description  = '';
        this.tooltip      = symbol;
        this.contextValue = 'cachePadItem';
        if (recent) {
            this.iconPath = new vscode.ThemeIcon('symbol-variable', new vscode.ThemeColor('charts.yellow'));
        }
    }
}

export class CachePad implements vscode.TreeDataProvider<CachePadItem> {
    private items: string[] = [];
    private recentSet = new Set<string>();  // items inserted within last 5 s
    private maxItems: number;
    private broadcast: (msg: object) => void;
    private suppressAbsorb = false;  // set by clear(); blocks absorbDocument until user adds an item or switches file

    private _onDidChangeTreeData = new vscode.EventEmitter<undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(maxItems: number, broadcast: (msg: object) => void) {
        this.maxItems  = maxItems;
        this.broadcast = broadcast;
    }

    // --- TreeDataProvider ------------------------------------------------

    getTreeItem(element: CachePadItem): vscode.TreeItem { return element; }

    getChildren(): CachePadItem[] {
        return this.items.map((sym, i) =>
            new CachePadItem(i + 1, sym, this.recentSet.has(sym))
        );
    }

    // --- Public API -------------------------------------------------------

    getItems(): string[] { return [...this.items]; }

    prepend(symbol: string): void {
        if (STOP_WORDS.has(symbol)) return;
        if (symbol.length < 2) return;
        this.prependExplicit(symbol);
    }

    // Like prepend() but skips stop-word filtering — for user-directed caching
    // where the user explicitly chose what to cache.
    prependExplicit(symbol: string): void {
        if (symbol.length < 1) return;
        this.suppressAbsorb = false;  // explicit add re-enables auto-population
        this.items = [symbol, ...this.items.filter(s => s !== symbol)].slice(0, this.maxItems);
        this.markRecent(symbol);
        this.refresh();
    }

    insertAt(index: number): string | undefined {
        const sym = this.items[index - 1]; // 1-based
        if (sym) this.markRecent(sym);
        return sym;
    }

    evict(index: number): void {
        this.items.splice(index - 1, 1);
        this.refresh();
    }

    clear(): void {
        this.items = [];
        this.recentSet.clear();
        this.suppressAbsorb = true;
        this.refresh();
    }

    unsuppress(): void { this.suppressAbsorb = false; }

    sync(items: string[]): void {
        this.items = items.slice(0, this.maxItems);
        this.refresh();
    }

    // Scan changed text regions in a document edit for new identifiers.
    absorbEdit(event: vscode.TextDocumentChangeEvent): void {
        for (const change of event.contentChanges) {
            const text = change.text;
            let m: RegExpExecArray | null;
            IDENTIFIER_RE.lastIndex = 0;
            while ((m = IDENTIFIER_RE.exec(text)) !== null) {
                this.prepend(m[0]);
            }
        }
    }

    // Full rescan of the document — used on file open / manual refresh.
    absorbDocument(doc: vscode.TextDocument): void {
        if (this.suppressAbsorb) return;
        const text = doc.getText();
        const found: string[] = [];
        let m: RegExpExecArray | null;
        IDENTIFIER_RE.lastIndex = 0;
        while ((m = IDENTIFIER_RE.exec(text)) !== null) {
            if (!STOP_WORDS.has(m[0])) found.push(m[0]);
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
    cacheWordAtCursor(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const range = editor.document.getWordRangeAtPosition(editor.selection.active, IDENTIFIER_RE);
        if (!range) return;
        const word = editor.document.getText(range);
        this.prepend(word);
    }

    // --- Private ----------------------------------------------------------

    private markRecent(symbol: string): void {
        this.recentSet.add(symbol);
        setTimeout(() => {
            this.recentSet.delete(symbol);
            this._onDidChangeTreeData.fire(undefined);
        }, 5000);
    }

    private refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
        this.broadcast({ event: 'cacheUpdate', items: this.items });
    }
}
