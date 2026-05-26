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
exports.ModeStatusBar = void 0;
const vscode = __importStar(require("vscode"));
class ModeStatusBar {
    constructor() {
        this.mode = 'dictation';
        // High priority → appears near the left side of the status bar
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        this.item.command = undefined;
        this.render();
        this.item.show();
    }
    setMode(mode) {
        this.mode = mode;
        this.render();
    }
    getMode() { return this.mode; }
    dispose() { this.item.dispose(); }
    [Symbol.dispose]() { this.dispose(); }
    render() {
        if (this.mode === 'command') {
            this.item.text = '$(mic) COMMAND';
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.item.tooltip = 'Voice Coder: command mode — utterances are interpreted as commands';
        }
        else {
            this.item.text = '$(keyboard) DICTATION';
            this.item.backgroundColor = undefined;
            this.item.tooltip = 'Voice Coder: dictation mode — speech is inserted as text';
        }
    }
}
exports.ModeStatusBar = ModeStatusBar;
//# sourceMappingURL=statusbar.js.map