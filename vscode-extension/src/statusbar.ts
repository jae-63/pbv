import * as vscode from 'vscode';

export type Mode = 'command' | 'dictation';

export class ModeStatusBar {
    private item: vscode.StatusBarItem;
    private mode: Mode = 'command';
    private ready = false;

    constructor() {
        // High priority → appears near the left side of the status bar
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        this.item.command = undefined;
        this.render();
        this.item.show();
    }

    setMode(mode: Mode): void {
        this.mode = mode;
        this.render();
    }

    setReady(ready: boolean): void {
        this.ready = ready;
        this.render();
    }

    getMode(): Mode { return this.mode; }

    dispose(): void { this.item.dispose(); }
    [Symbol.dispose](): void { this.dispose(); }

    private render(): void {
        if (this.mode === 'command') {
            this.item.text = '$(mic) COMMAND';
            if (this.ready) {
                this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                this.item.tooltip         = 'Voice Coder: listening — utterances are interpreted as commands';
            } else {
                this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                this.item.tooltip         = 'Voice Coder: initializing speech recognition…';
            }
        } else {
            this.item.text            = '$(keyboard) DICTATION';
            this.item.backgroundColor = undefined;
            this.item.tooltip         = 'Voice Coder: dictation mode — speech is inserted as text';
        }
    }
}
