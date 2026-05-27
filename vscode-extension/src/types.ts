// All messages Swift app → extension are newline-delimited JSON on the TCP socket.

export type InboundMessage =
  | { cmd: 'insertText';       text: string }
  | { cmd: 'gotoLine';         line: number }
  | { cmd: 'gotoWordOnLine';   word: number; line: number }
  | { cmd: 'selectToken';      token: string }
  | { cmd: 'insertCacheItem';  index: number }
  | { cmd: 'cacheCurrentWord' }
  | { cmd: 'refreshCachePad' }
  | { cmd: 'evictCacheItem';   index: number }
  | { cmd: 'clearCachePad' }
  | { cmd: 'syncCacheItems'; items: string[] }
  | { cmd: 'setMode';          mode: 'command' | 'dictation' }
  | { cmd: 'undo' }
  | { cmd: 'redo' }
  | { cmd: 'startUndoGroup' }
  | { cmd: 'endUndoGroup' }
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
  | { cmd: 'duplicateLine' };

export type OutboundMessage =
  | { ok: true }
  | { ok: false; error: string }
  | { event: 'cacheUpdate'; items: string[] }
  | { event: 'modeChanged'; mode: 'command' | 'dictation' };
