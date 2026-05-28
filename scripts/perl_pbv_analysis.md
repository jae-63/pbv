# Voice-Coding Workflow Reference: Dragon NaturallySpeaking + Emacs (circa 2000)

Reconstructed from screen recording "perl1" showing the authoring of `biasvocabulary.pl`, a Perl script that generates biased training text for NaturallySpeaking. The session demonstrates a deeply integrated voice-coding system built on Dragon NaturallySpeaking, NatLink, and Emacs with a custom `*CACHEPAD*` buffer.

---

## 1. Navigation Commands

### Line-Relative Motion
| Spoken Phrase | Action |
|---|---|
| `move up <N>` / `move up one` | Move cursor up N lines |
| `move down <N>` / `move down one` / `move down two` / `move down three` / `move down four` | Move cursor down N lines |
| `move up` / `move down` (no count) | Begin continuous motion (terminated by `stop moving`) |
| `stop moving` | Halt continuous motion |
| `beginning of line` / `beginning of the line` | `C-a` |
| `end of line` / `end of the line` | `C-e` |
| `beginning of buffer` | `M-<` |
| `end of buffer` | `M->` |

### Character/Word Motion
| Spoken Phrase | Action |
|---|---|
| `move left <N>` (`move left one`, `move left two`, `move left three`, `move left five`, `move left six`, `move left eight`) | `C-b` × N |
| `move right <N>` (`move right one`, `move right two`, `move right three`, `move right four`) | `C-f` × N |
| `kill word` | `M-d` |

### Page Motion
| Spoken Phrase | Action |
|---|---|
| `press page up` | `prior` |
| `press page down` | `next` |
| `toggle line numbers` | Toggle line-number display in mode line |

### Token-Based Navigation (jump-to-token)
A signature feature: jump to the N-th occurrence of a named token or character class on a given line.

| Spoken Phrase | Action |
|---|---|
| `jump to first <token> on <line-number>` | Goto line, find first instance of token |
| `jump to last <token> on <line-number>` | Goto line, find last instance of token |
| `jump to first at sign on current line` | Find first `@` on current line |
| `jump to first sierra on current line` | Find first `s` on current line |

Observed instances:
- `jump to first tango on 21` → first `t` on line 21
- `jump to first underscore on 18` → first `_` on line 18
- `jump to last asterisk on 15` → last `*` on line 15
- `jump to first percent sign on 46` → first `%` on line 46
- `jump to first oscar on 58` → first `o` on line 58
- `jump to last romeo on 63` → last `r` on line 63
- `jump to last whiskey on 79` → last `w` on line 79
- `jump to first whiskey on 78` → first `w` on line 78
- `jump to last romeo on 81` → last `r` on line 81

Tokens are spelled via NATO phonetic alphabet (alpha, bravo, charlie, … romeo, sierra, tango, whiskey, …) when single letters; full words used when distinguishable (e.g., `asterisk`, `at sign`, `underscore`, `percent sign`).

### Symbol-Based Navigation (highlighted symbol list)
The right pane (`*CACHEPAD*`) lists numbered identifiers seen in the buffer. Searches operate over them.

| Spoken Phrase | Action |
|---|---|
| `find symbol <N>` | Search for symbol at numbered slot N |
| `search forward` | Incremental search forward |
| `search back` / `search backward` | Incremental search backward |
| `search` | Continue last search (repeated rapidly: `search. search. search. search.`) |

### Selection
| Spoken Phrase | Action |
|---|---|
| `select <token-or-phrase>` | Search for and visually select the next match (`select this program`, `select stored each`, `select for the`, `select bias`, `select model two`, `select equal two`, `select at sign`, `select output underscore file name`, `select standard underscore length`, `select blind line`, `select undo it`) |
| `select` (alone, after a directional move) | Set mark at point for visual region |

`select <text>` appears to put the matched region in a state where it can be replaced by the next dictated/spoken phrase (Dragon "Select-and-Say"–style correction).

### Frame / Window / Buffer Management
| Spoken Phrase | Action |
|---|---|
| `new frame` | `make-frame` |
| `other window` | `C-x o` |
| `split window` | `C-x 2` or `C-x 3` |
| `minimize window` | Minimize current OS window |
| `kill buffer` | `C-x k` |
| `save buffer` | `C-x C-s` |
| `find file` | `C-x C-f` |
| `find pasted file` | `C-x C-f` with clipboard contents as initial input |
| `files menu` | Open Files menu |
| `bring up task <N>` | Switch to task N (presumably Windows taskbar slot) |
| `refresh` | Revert buffer / reload |
| `run shell` | `M-x shell` |
| `run curl` | Invoke curl from a shell buffer |
| `last command` | `C-x ESC ESC` (repeat last complex command) |

---

## 2. Code Generation Templates

These voice phrases expand to multi-character syntactic structures, typically with point positioned for the next fill-in.

### Control Flow Templates
| Spoken Phrase | Expansion (Perl context, cperl-mode) |
|---|---|
| `for each statement` | `foreach §_ (•) {` `<newline>` `  •` `<newline>` `}` (point positioned at first `•`, often the iterator variable; `§_` is a default `$_`) |
| `for statement` | `for (•; •; •) {` `<newline>` `  •` `<newline>` `}` |
| `while statement` | `while (•) {` `<newline>` `  •` `<newline>` `}` |
| `if statement` | `if (•) {` `<newline>` `  •` `<newline>` `}` |
| `else statement` | `} else {` `<newline>` `  •` `<newline>` `}` (or inserts `else { … }` clause onto existing if) |
| `match pattern` | `m/•/` with point inside the slashes |
| `trailing conditional` | ` if (•);` appended at end-of-statement position |
| `substitute` | `s/•/•/` |

### Syntactic Sugar / Idioms
| Spoken Phrase | Effect |
|---|---|
| `short jump` | Move past the closing delimiter (e.g., past `)` or `}`) of the current template slot — analogous to a "tab out" in modern snippet systems |
| `default` | Accept the current template default value and advance to next slot |
| `electric end` | Insert a context-appropriate closer (e.g., `}` plus newline) |
| `indent region` | `C-M-\` on active region |
| `fill in comment` / `fill and comment` | Reflow the preceding free-form dictation as a `#` comment block (turns prose into multi-line `# …` comments) |
| `header line` | Insert shebang/header line (e.g., `#!/H:\Perl\bin\perl.exe`) |
| `is assigned value` | Insert ` = ` (with proper spacing) |
| `cash into sign` / `cash and assign` | Insert `$… = ` for a scalar assignment (combined sigil + assignment) |
| `cash word` | Insert `$word` (`$` + the next token as variable) |
| `cash <name>` | Insert `$<name>` |
| `at sign <name>` | Insert `@<name>` |
| `percent sign <name>` | Insert `%<name>` |
| `scalar <N>` | Insert the identifier at cache slot N as a scalar reference (`$name`) — see §3 |
| `print` | Insert `print ` |
| `chomp` | Insert `chomp;` |

### Text-Insertion / Casing Modes
| Spoken Phrase | Effect |
|---|---|
| `no space on` | Subsequent dictation has no inter-word spaces |
| `no space off` | Resume normal spacing |
| `no cap that` | Lowercase the last dictated word |
| `all caps <word>` | Insert `<WORD>` in uppercase |
| `all count that` | (Apparent ASR garble for "all caps that") uppercase prior token |
| `count sign` | (ASR garble) `#` (also `pound sign`) |
| `toggle natural text` | Toggle Dragon's "natural language" punctuation mode |
| `enable select and say` / `disable select and say` | Toggle Dragon Select-and-Say availability on the buffer |
| `press enter` / `new line` | `RET` |
| `press tab key` | `TAB` |
| `press spacebar` | `SPC` |
| `press <letter>` / `press <NATO>` | Insert that literal letter (`press whiskey`, `press oscar`, `press india`, `press bravo`, `press period`, `press exclamation mark`, `press back slash`) |
| `rub out` | Backward delete one char |
| `backspace <N>` (`backspace two`, `backspace three`, `backspace four`, `backspace five`, `backspace seven`, `backspace nine`) | Delete N chars backward |
| `delete previous four characters` | Same as `backspace 4`, longer form |
| `kill line` | `C-k` |
| `kill two lines` | `C-k` × 2 |
| `kill <N> characters` (`kill three characters`, `kill four characters`, `kill eight characters`) | Delete N forward chars |
| `kill one` | `C-k` (variant) |
| `yank it back` | `C-y` |

### Punctuation Phrases (verbose)
The transcript shows verbalized punctuation tokens, often combined:
- `open quote` / `close quote` → `"` `"`
- `open paren` / `left paren` / `right paren` → `(` `)`
- `left bracket` / `right bracket` → `[` `]`
- `left brace` / `right brace` → `{` `}`
- `semicolon` → `;`
- `comma` → `,`
- `period` → `.` (within prose); `press period` literal dot
- `colon` → `:`
- `dollar sign` → `$`
- `at sign` → `@`
- `percent sign` → `%`
- `back slash` / `backslash` → `\`
- `equal sign` / `equals sign` → `=`
- `plus sign` → `+`
- `greater than` / `less than` → `>` `<`
- `exclamation mark` → `!`
- `asterisk` → `*`
- `carat` → `^`
- `question mark` → `?`
- `slash` → `/`

---

## 3. Cache Pad Operations

The right-hand `*CACHEPAD*` window displays 1–20 numbered slots, each holding a recently-edited identifier. Slots auto-populate as new symbols are typed; the most recent symbol becomes slot 1 and others shift down. Highlighting in the cache pad indicates the most recently used / referenced identifiers.

### Population
- **Automatic**: Every time a new identifier is dictated and entered into the buffer, it appears to be pushed into slot 1, shifting others. Frame progression shows the list growing from `(1) sample_text_fi…` to a full 20-slot list as more variables are introduced.
- **Explicit (rare in this session)**: `cache word`, `cache and`, `cache <name>` appear inside string literals (data), not as cache-operations — those particular utterances were dictating *the words* `"cache word"` and `"cache and@"` as literal contents of a Perl array.

### Retrieval / Insertion
| Spoken Phrase | Effect |
|---|---|
| `recent <N>` (`recent one`, `recent two`, `recent three`, `recent four`, `recent seven`, `recent ten`, `recent eleven`, `recent twelve`, `recent thirteen`, `recent fifteen`, `recent sixteen`) | Insert the identifier at slot N at point |
| `scalar <N>` (`scalar one`, `scalar two`, `scalar three`, `scalar four`, `scalar five`, `scalar twelve`, `scalar thirteen`, `scalar fifteen`) | Insert `$<identifier-at-slot-N>` |
| `at sign recent <N>` (`at sign recent four`, `at sign recent eleven`, `at sign recent sixteen`) | Insert `@<identifier-at-slot-N>` |
| `cache at first <letter> on <line>` | After visiting line N, take the symbol at the first occurrence of that initial letter and store it (presumably re-promote it to a cache slot) |
| `cache at last <letter> on <line>` | Same, last occurrence |
| `cache it first <letter> on <N>` (`cache it first tango on 21`, `cache it first underscore on 18`) | Same family; promote a token from a remote line into the cache |

### Search by Cache
- `find symbol <N>` — initiate `isearch` for the cached symbol, jumping to occurrences.

The cache pad is therefore both a **history of recently-entered identifiers** and a **named clipboard** with sigil-aware insertion (`scalar 3` ≠ `recent 3` ≠ `at sign recent 3`).

---

## 4. Transaction Commands

Voice transactions wrap a sequence of edits in an atomic undo boundary, so a single `undo transaction` rewinds an entire spoken phrase.

### Markers
| Spoken Phrase | Effect |
|---|---|
| `set mark` | Begin a transaction (also sets Emacs mark — overloaded). Used at the start of any large multi-step insertion such as a comment block, a multi-line literal, or a `for`/`while` construct. |
| `undo transaction` | Roll back to the last `set mark`. Discards all intervening edits as one unit. |
| `undo edit` | Single-step undo (`C-_` or `undo` once) — finer-grained than `undo transaction`. |
| `scratch that` | Dragon's built-in: discard last dictated phrase (works only on un-committed dictation). |

### Patterns Protected
Observed `set mark` … `<work>` … `undo transaction` patterns:
1. **Multi-line prose comment**: `set mark this program generates… Fill and comment` — wraps the prose-to-comment fill.
2. **Free-form descriptive comment** before `@single_default_written_words`.
3. **Template fill-in errors**: when a `foreach` or `for` template was started and the first slot filled with the wrong identifier, `undo transaction` retracted the entire template insertion in one step.
4. **String-literal corrections**: large quoted blocks (e.g., the error messages `"unable to open directory …"`) where individual word substitutions failed.
5. **`indent region` setups**: `set mark` … `move down two` … `indent region` uses `set mark` for the *region mark* rather than transaction (overloaded semantics).

Repeated `undo edit. undo edit. undo edit.` is used when finer rollback is needed than the transaction granularity.

---

## 5. Multi-Command Utterances

Dragon's continuous-command mode lets one breath chain many commands. The recognizer apparently splits on known command boundaries.

### Examples from Transcript

**Variable declaration with sigil + assign + literal + terminator:**
> `dollar sign words underscore per underscore line cash into sign 8 semicolon new line`
- Output: `$words_per_line = 8;\n`

**File pattern declaration with embedded NATO + punctuation:**
> `dollar sign sample underscore text underscore file underscore pattern cash into sign open quote no space on data back slash letter delta asterisk dot letter bravo india november close quote semicolon new line`
- Output: `$sample_text_file_pattern = "data\d*.bin";\n`

**Template entry + slot fill + sigil + cache lookup + body kickoff:**
> `for each statement press underscore move right two press at sign recent four short jump`
- Inserts `foreach`, replaces first slot with `$_`, advances past it, inserts `@<slot-4-symbol>` for the iterable, jumps past `)`.

**Selection → replacement workflow (Dragon corrections in flight):**
> `dollar sign bias underscore level spell that move left six delete previous four characters india alpha sierra choose one cash into sign 0.70 semicolon new line`
- Types `$bias_level`, opens spell-window, navigates, replaces 4 chars with letters `i`, `a`, `s` (spelled), picks correction choice 1, then continues with assignment.

**Navigate-and-correct chain:**
> `jump to first percent sign on 46 move right one rub out jump to first oscar on 58 kill one yank it back yank it back`
- Six chained edits across two remote lines.

**Symbol-replace pattern:**
> `select output underscore file name move down two select output underscore file name move down three select output underscore file name training underscore file name`
- Selects identifier, moves to next instance, re-selects, then dictates replacement.

**Window/file workflow:**
> `new frame capture file name files menu split window run shell run curl paste that press enter other window find file space press enter refresh`

### Observed Maximum Chain Length
Single utterances of ~15–20 atomic commands are routine, especially during navigation-and-correction passes.

---

## 6. Command Grammar Patterns

### Number Words
- Cardinal small numbers spoken as words: `one` … `twenty` (and beyond as needed). Numeric literals in code dictated as digits (`0.70`, `2048`, `1024`) or as compound (`one comma 20` → `(1, 20)`).
- Repetition counts inline: `move down two`, `backspace seven`, `kill three characters`. The number is the final word of the verbal phrase.

### Ordinals
- Used for token-position selection: `jump to first <X> on <N>`, `jump to last <X> on <N>`.
- Only `first` and `last` observed; no `second`, `third`, etc. in this recording.

### Line References
- `on <number>` or `on current line` as a postfix locator.
- `line <N>` alone not heard explicitly; `jump to … on N` is the canonical form.

### NATO Phonetic Spelling
For literal single letters and ambiguous short symbols:
- alpha, bravo, charlie, delta, echo, foxtrot, golf, india, kilo, lima/lynx, november, oscar, papa, romeo, sierra, tango, whiskey, x-ray, yankee
- Used in: variable name letters (`letter kilo bravo` → `kb`), regex characters (`backslash letter delta` → `\d`, `backslash letter sierra` → `\s`, `backslash letter whiskey` → `\w`, `backslash letter november` → `\n`, `backslash letter romeo` → `\r`), file extensions (`letter tango x-ray tango` → `txt`).

### Prefix vs. Bare Forms
- `press <X>` for any literal key (`press enter`, `press tab key`, `press spacebar`, `press period`, `press whiskey`).
- Bare names work for high-frequency tokens (`new line`, `space bar`, `semicolon`, `comma`).
- `press <NATO>` and bare `<NATO>` both produce a single letter — `press` likely forces literal insertion regardless of context.

### Casing Modifier Grammar
- Modifiers are *prefixed* to the affected word: `all caps directory` → `DIRECTORY`, `no cap that` → de-capitalize last word.
- Mode toggles persist until explicitly turned off: `no space on` / `no space off`.

### Sigil-Combined Forms
A productive vocabulary fuses sigil + slot/word into one phrase:
- `cash word` = `$` + `word`
- `cash and assign` = `$<word> = `
- `cash into sign` = `$<prev> = ` (or `<prev> = ` — assigns to whatever was just dictated)
- `scalar <N>` = `$` + cache[N]
- `at sign recent <N>` = `@` + cache[N]

### Choice / Correction Grammar
- `spell that` → opens correction dialog with N candidate spellings.
- `choose <N>` → select candidate N (`choose one`, `choose two`, `choose three`).
- `click cancel` → dismiss correction dialog.
- `train …` → train Dragon on current word (available but not selected in recording).

---

## 7. Inferred Macro Architecture

### Layers

**NatLink Python layer** receives recognized grammars from NaturallySpeaking and dispatches via DDE/socket to Emacs. Each command grammar registers a callback that:
1. Parses arguments (numbers, NATO letters, slot indices, line numbers).
2. Sends an Emacs Lisp form for evaluation, e.g.
   `(jump-to-first ?@ (current-line))`
   `(insert-cache-symbol 4 'scalar)`
   `(voice-transaction-begin)` / `(voice-transaction-end)`.

**Emacs Lisp side** must implement at minimum:

```elisp
(defvar voice-cache-pad (make-vector 20 ""))   ; ring of recent identifiers
(defun voice-cache-push (sym) …)               ; called from after-change-functions
(defun voice-cache-insert (n &optional sigil)
  "Insert cache[N], optionally prefixed with $/@/%."
  …)

(defvar voice-transaction-marker nil)          ; buffer position at set-mark
(defun voice-transaction-begin ()
  (setq voice-transaction-marker (point-marker))
  (push-mark (point) t))
(defun voice-transaction-end ()                ; "undo transaction"
  (delete-region voice-transaction-marker (point)))

(defun voice-jump-to-token (which char line)
  (goto-line line)
  (cond ((eq which 'first) (search-forward (char-to-string char) (line-end-position)))
        ((eq which 'last) (search-backward (char-to-string char) (line-beginning-position)))))

(defun voice-template-foreach ()
  (insert "foreach $_ () {\n  \n}")
  (search-backward "(") (forward-char 1)
  (voice-mark-slot-positions))                 ; record fill points for "short jump"

(defun voice-short-jump ()
  (goto-char (pop voice-template-slots)))
```

### Cache-Pad Population Hook
Likely an `after-change-function` that scans inserted text for identifier tokens (`[A-Za-z_][A-Za-z0-9_]*` of length ≥ 3) and prepends them to the ring, then refreshes the `*CACHEPAD*` buffer (a side window in a window-split layout).

### Templates as Skeletons
Almost certainly built on Emacs's `skeleton.el` or `tempo.el`, with explicit interaction points so that `short jump`, `default`, and `electric end` are slot-navigation primitives.

### Select-and-Say Bridge
`enable select and say` / `disable select and say` likely toggles whether Emacs publishes its buffer contents to Dragon's Select-and-Say service (so that `select <text>` works against the live Emacs buffer rather than just a Dragon edit field). This is the most architecturally complex piece — it would require Emacs to expose buffer text via OLE/DDE to Dragon.

### Mode Sensitivity
Different programming modes (CPerl, Lisp Interaction) probably adjust:
- Sigil defaults (`cash into sign` makes sense only in Perl).
- Template bodies (`for each statement` differs in Perl vs. Lisp).
- Comment-fill behavior (`fill and comment` uses `comment-region` + `fill-paragraph`).

The status bar shows mode `