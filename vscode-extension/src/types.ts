// All messages Swift app → extension are newline-delimited JSON on the TCP socket.

export type InboundMessage =
  | { cmd: 'transcript';       text: string }
  | { cmd: 'insertText';       text: string }
  | { cmd: 'replaceSelection'; text: string }
  | { cmd: 'gotoLine';         line: number }
  | { cmd: 'gotoWordOnLine';   word: number; line: number }
  | { cmd: 'selectToken';           token: string }
  | { cmd: 'selectRange';           startToken: string; endToken: string }
  | { cmd: 'cacheSelection' }
  | { cmd: 'closeString' }
  | { cmd: 'enterScrollMode';   direction: 'down' | 'up' | 'left' | 'right' }
  | { cmd: 'enterTraversalMode'; pattern?: string }
  | { cmd: 'exitScrollMode' }
  | { cmd: 'scrollStep';        direction: 'forward' | 'back' }
  | { cmd: 'selectAndCacheToken';   token: string }
  | { cmd: 'selectAndCacheRange';   startToken: string; endToken: string }
  | { cmd: 'insertCacheItem';  index: number; prefix?: string }
  | { cmd: 'jumpToCharOnLine'; ordinal: number; char: string; line: number }
  | { cmd: 'cacheCurrentWord' }
  | { cmd: 'refreshCachePad' }
  | { cmd: 'evictCacheItem';   index: number }
  | { cmd: 'clearCachePad' }
  | { cmd: 'syncCacheItems'; items: string[] }
  | { cmd: 'setMode';          mode: 'command' | 'dictation' }
  | { cmd: 'commandMode' }
  | { cmd: 'dictationMode' }
  | { cmd: 'showCommands' }
  | { cmd: 'showCachePad' }
  | { cmd: 'setReady';         ready: boolean }
  | { cmd: 'undo' }
  | { cmd: 'redo' }
  | { cmd: 'startUndoGroup' }
  | { cmd: 'endUndoGroup' }
  | { cmd: 'setMark' }
  | { cmd: 'jumpToMark' }
  | { cmd: 'setNavMark' }
  | { cmd: 'jumpToNavMark' }
  | { cmd: 'selectWord' }
  | { cmd: 'matchParen' }
  | { cmd: 'undoTransaction' }
  | { cmd: 'deleteChars';      n: number }
  | { cmd: 'selectChars';      n: number }
  | { cmd: 'deleteWords';      n: number }
  | { cmd: 'cursorUp';         n?: number }
  | { cmd: 'cursorDown';       n?: number }
  | { cmd: 'cursorLeft' }
  | { cmd: 'cursorRight' }
  | { cmd: 'cursorHome' }
  | { cmd: 'cursorEnd' }
  | { cmd: 'cursorTop' }
  | { cmd: 'cursorBottom' }
  | { cmd: 'pageUp' }
  | { cmd: 'pageDown' }
  | { cmd: 'find' }
  | { cmd: 'replace' }
  | { cmd: 'selectAll' }
  | { cmd: 'cut' }
  | { cmd: 'copy' }
  | { cmd: 'paste' }
  | { cmd: 'save' }
  | { cmd: 'formatDocument' }
  | { cmd: 'toggleLineComment' }
  | { cmd: 'deleteLine' }
  | { cmd: 'deleteToEndOfLine' }
  | { cmd: 'duplicateLine' }
  | { cmd: 'dictateText';  text: string }
  | { cmd: 'underlineLine'; char?: string };

export type OutboundMessage =
  | { ok: true }
  | { ok: false; error: string }
  | { event: 'cacheUpdate'; items: string[] }
  | { event: 'modeChanged'; mode: 'command' | 'dictation' };
