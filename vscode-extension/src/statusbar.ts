import * as vscode from 'vscode';

export type Mode = 'command' | 'dictation';

type ScrollState =
    | { active: false }
    | { active: true; kind: 'scroll'; direction: string }
    | { active: true; kind: 'traverse' };

const SCROLL_ARROW: Record<string, string> = {
    down: '↓', up: '↑', left: '←', right: '→',
};

export class ModeStatusBar {
    private item:   vscode.StatusBarItem;
    private mode:   Mode        = 'command';
    private ready               = false;
    private scroll: ScrollState = { active: false };

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        this.item.command = undefined;
        this.render();
        this.item.show();
    }

    setMode(mode: Mode): void       { this.mode  = mode;  this.render(); }
    setReady(ready: boolean): void  { this.ready = ready; this.render(); }
    getMode(): Mode { return this.mode; }

    setScrollMode(state: ScrollState): void { this.scroll = state; this.render(); }

    dispose(): void { this.item.dispose(); }
    [Symbol.dispose](): void { this.dispose(); }

    private render(): void {
        const scrollSuffix = this.scrollSuffix();

        if (this.mode === 'command') {
            this.item.text = `$(mic) COMMAND${scrollSuffix}`;
            if (this.scroll.active) {
                this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
                this.item.tooltip         = this.scrollTooltip();
            } else if (this.ready) {
                this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                this.item.tooltip         = 'PBV: listening — utterances interpreted as commands';
            } else {
                this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                this.item.tooltip         = 'PBV: initializing speech recognition…';
            }
        } else {
            this.item.text            = `$(keyboard) DICTATION${scrollSuffix}`;
            this.item.backgroundColor = this.scroll.active
                ? new vscode.ThemeColor('statusBarItem.prominentBackground')
                : undefined;
            this.item.tooltip = this.scroll.active
                ? this.scrollTooltip()
                : 'PBV: dictation mode — speech is inserted as text';
        }
    }

    private scrollSuffix(): string {
        if (!this.scroll.active) return '';
        if (this.scroll.kind === 'traverse') return '  ≡';
        const arrow = SCROLL_ARROW[this.scroll.direction] ?? '↓';
        return `  ${arrow}`;
    }

    private scrollTooltip(): string {
        if (!this.scroll.active) return '';
        if (this.scroll.kind === 'traverse') return 'PBV: traversal mode — "stop scrolling" to exit';
        return `PBV: scrolling ${this.scroll.direction} — "faster", "slower", "stop scrolling"`;
    }
}
