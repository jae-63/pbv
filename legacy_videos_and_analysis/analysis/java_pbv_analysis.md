# Voice Coding System Reference: Java-by-Voice Reenactment

A reference document reconstructing the voice-driven Emacs workflow used to author `flashing.java` (an applet displaying "hello, voice coders"). Based on a 38-minute screencast with continuous-speech Dragon NaturallySpeaking commands.

---

## 1. Navigation Commands

### Line-relative movement
| Spoken Phrase | Action |
|---|---|
| `move down <N>` | Move cursor down N lines (e.g. "move down five", "move down two", "move down one", "move down three", "move down four") |
| `move up <N>` | Move cursor up N lines ("move up one") |
| `move down` … `stop moving` | Begin continuous downward scroll; halt on "stop moving" |
| `move up` … `stop moving` | Begin continuous upward scroll |
| `faster` | Increase continuous-scroll speed mid-motion |
| `move right <N>` | Move forward N characters ("move right ten", "move right eight", "move right twelve", "move right one", "move right two") |
| `move left <N>` | Move backward N characters ("move left nine", "move left ten", "move left two", "move left three", "move left five", "move left seven", "move left twenty") |
| `move left <N> characters` | Explicit-unit form ("move left five characters", "move left seven characters") |
| `move left <N> words` | Word-granularity backward ("move left two words") |

### Line/character navigation by content
| Spoken Phrase | Action |
|---|---|
| `end of the line` / `end of line` | Move to end of current line |
| `beginning of line` | Move to start of current line |
| `jump to first <letter-word> on current line` | Move to first occurrence of that character on this line (e.g. "jump to first papa on current line") |
| `jump to last <letter-word> on current line` | Last occurrence on this line ("jump to last right paren on current line", "jump to last golf on current line") |
| `jump to last <letter-word> on previous line` | Last occurrence on previous line ("cash at last golf on previous line" — likely a chained variant where `cash` follows the jump) |
| `jump to last <letter-word> on <N>` | Jump to last occurrence on line N ("jump to last November on 74", "jump to last November on three") |
| `jump to first <letter-word> on <N>` | First occurrence on line N ("jump to first Charlie on five", "jump to first x-ray on 46") |
| `search back <text>` | Incremental search backward ("search back cap public") |

### Window / buffer navigation
| Spoken Phrase | Action |
|---|---|
| `other window` | `C-x o` — switch Emacs window |
| `new frame` | Open new Emacs frame |
| `find file <name>` | `C-x C-f` followed by filename ("find file flashing.html") |
| `JDE menu` | Invoke the JDE (Java Development Environment for Emacs) menu |
| `press enter` | RET |
| `bring up task <N>` | Switch to Windows task N (taskbar slot); used to bring up Netscape |
| `toggle line numbers` | Toggle a line-number display mode |

### Letter alphabet (NATO-style) for character-precise navigation
Letters spoken as `letter <word>` or just `<word>` in context:
`alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey x-ray yankee zulu`.

Examples: `letter india november india tango` → `init`, `letter november uniform lima lima` → `null`, `letter papa alpha romeo alpha mike` → `param`, `letter golf echo tango` → `get`, `letter sierra tango oscar papa` → `stop`.

---

## 2. Code Generation Templates

### Class/method scaffolds (typed via continuous dictation, not templates per se)
Constructs like `public class … extends … implements … { … }` are built word-by-word using the keyword dictionary (`public`, `class`, `void`, `private`, `static`, `final`, `extends`, `implements`, `new`, `return`, etc.) plus punctuation words (`left brace`, `right brace`, `left paren`, `right paren`, `semicolon`, `new line`).

### True templates (single phrase → multi-token expansion + point landing)
| Spoken Trigger | Expansion |
|---|---|
| `if statement` | `if ( | ) {` newline `}` with point inside the condition |
| `for loop` (implied by system though not invoked here) | `for ( ; ; ) { }` |
| `while statement` | `while ( | ) {` newline `}` |
| `try statement` | `try { | } catch ( ) { }` |
| `short jump` | Exit current parenthesized/condition region and continue on the body line (used after `if`, `while`, `try`, and after binary operators to break out and proceed) |
| `fill in comment` / `fill and comment` | After `set mark <free text>`, wraps the dictated text into `// …` block comment and reformats |
| `electric end` | Smart end-of-construct (terminates a statement and closes braces/semicolons appropriately) |
| `logical and` | ` && ` |
| `logical or` | ` \|\| ` |
| `vertical bar no space equal sign` | `\|=` (composite operator, no spacing) |
| `cash and assign` | ` = ` after dropping a cached identifier on the LHS (often pairs with `recent N`) |
| `cash into sign` | Likely `= ` assignment used in initializer position (variant of cash-and-assign for capturing the LHS into cache) |
| `is assigned value` | ` = ` (plain assignment) |
| `is equal to` | ` == ` |
| `is not equal to` | ` != ` |
| `open quote` … `close quote` | `"…"` literal |

### Punctuation words
`left paren`, `right paren`, `left brace`, `right brace`, `semicolon`, `new line`, `spacebar`, `exclamation mark`, `period`, `comma`, `slash slash` (line comment), `equal sign`, `plus sign`, `hyphen`, `vertical bar`.

### Capitalization modifiers
- `cap <word>` — capitalize next word (`cap string`, `cap font`, `cap integer`)
- `no cap <word>` — force lowercase (`no caps java`)
- `all caps <word>` — uppercase the word (`all caps label`, `all caps plain`, `all caps italic`, `all caps bold`)
- `up case word` — uppercase word at point (post-hoc transform)
- `no space <word>` — concatenate (no separating space) with previous token: `sleep no space cap value` → `sleepValue`; `font no space cap name` → `fontName`; `text no space cap font` → `textFont`
- `all cap that` / `all caps that` — uppercase the just-spoken identifier (used to convert e.g. `sleepTime` → `SLEEP_TIME` for a constant; note: appears to also insert underscores in some cases since constants like `SLEEP_TIME` materialize)

---

## 3. Cache Pad Operations

### Slot model
A 20-slot LRU "cache pad" of recently-dictated/selected identifiers. New tokens push older ones down; slot 1 is most recent.

### Populating slots
- **Automatic on edit**: every time a fresh identifier is typed by voice (e.g. `cap string letter papa alpha romeo alpha mike` → `String param`), it appears to land in slot 1.
- **Explicit capture**: `cash word` — capture the just-spoken or surrounding word into the cache. Examples: `text no space cap value cash word`, `sleep no space time cash word`. This stuffs the identifier into the pad so it can be referenced numerically later in the same utterance.
- **Selection-driven**: `select <text>` (when *Select-and-Say* is enabled) makes that text the current selection, and subsequent `cap that` / `all caps that` / `cash that` operates on it. `select … cap that` is the canonical pattern for repairing recognition errors.

### Inserting slots
- `recent <N>` — insert the contents of cache slot N at point. Used pervasively: `recent two is not equal to null`, `recent three is assigned value`, `recent five is assigned value recent one semicolon`.
- `cash region` — push the current region onto the cache (seen in "set mark, beginning of line, exchange point in mark, cash region" sequence).
- `cash at last <letter> on <line>` / `cash at last golf on previous line` — combined navigate-and-cache: jumps and captures.

### Slot semantics observed in this session
Across the file, slots accreted the names of the principal identifiers:
- `recent 1` → most recent local (`f`, `font`, `g`, `flash` — rotates as edits proceed)
- `recent 2` → previous (`text`, `label`, `d`)
- `recent 3` → parseInt-related, `value`
- `recent 4` → `LABEL`, `flash`, then `font` family
- `recent 5` → `label`, then `fontName`
- `recent 6` → `fontStyle`, later `parseInt`
- `recent 7` → `g` (Graphics object)
- `recent 11` → `param` (used inside `metrics.stringWidth(param)`)

The exact mapping depends on edit order; the user keeps a mental model of which slot holds what.

### Repair pattern
`spell that` — opens a correction dialog listing alternates; `choose <N>` picks alternate N. Also `click cancel` aborts a correction popup. This is Dragon's built-in correction mechanism repurposed for code identifiers.

---

## 4. Transaction Commands

### `set mark`
Marks the start of an atomic operation. Two principal uses:
1. **Comment authoring**: `set mark <free dictated text> … fill in comment` — the marked region of dictation is converted to a `//` comment block.
   - Example: `set mark read in parameters and set values for sleep value, text value, and text font. fill and comment.`
   - Example: `set mark create a font object named textFont from the font parameters. fill in comment.`
   - Example: `set mark draw the label. fill in comment.`
2. **Compound region edits**: `set mark, beginning of line, exchange point in mark, cash region` — uses mark to delimit a region for cache capture (here the user selects an entire line and stuffs it on the pad).

### `undo transaction` / `undo two transactions`
Reverses the entire previous voice command as one undo unit, regardless of how many primitive Emacs operations it spawned. Critical because templates and `recent N` expansions each generate many keystrokes.

Observed usages:
- After mistyped `recent` insertion: `… is not equal to null. spell that. choose two. undo transaction. undo two transactions.` — the user said "spell that, choose two" thinking they were correcting, realized that altered text, then rolled back two transactions.
- After errant template: `if statement. recent one is equal to false. spell that. choose ten. undo transaction.`
- After bad cache reference: `recent one dot start … undo transaction. recent one dot start. backspace eight. dot start.` — rolled back and re-entered.

### `scratch that`
Dragon-native single-utterance undo (smaller granularity than `undo transaction`). Used for: `metrics is assigned value. scratch that. is assigned value.` — drops the most recent dictation phrase.

### Save / state
- `save buffer` — `C-x C-s`
- `enable select and say` / `disable select and say` — toggles Dragon's Select-and-Say mode (lets `select <text>` find and highlight arbitrary text in the buffer). Frequently toggled around navigation-heavy passages.

---

## 5. Multi-Command Utterances

These are real examples from the transcript — single breaths producing 3+ actions:

### Example A — variable declaration with embedded navigation
> `cap string font no space cap name cash into sign recent one semicolon. move left nine. up case word. move down one.`

Sequence:
1. Type `String fontName = `
2. Insert cache slot 1 contents (`recent 1`)
3. Type `;`
4. Move cursor left 9 chars (lands on `fontName`)
5. Uppercase that word → `FontName`? No — context shows correction of an identifier
6. Move down one line for next statement

### Example B — template + condition + branch
> `if statement. recent two is not equal to null. backspace four. letter november uniform lima mike. short jump recent three is assigned value cap integer dot parse no space cap letter india november tango. spell that. choose for. cash word left paren recent to write paren semicolon.`

Sequence:
1. Expand `if ( | ) { }`
2. Insert `recent 2 != nul` (then backspace 4 chars)
3. Letter-spell `null` precisely
4. `short jump` to body
5. Type `recent 3 = Integer.parseInt`
6. Correct via spell/choose
7. `cash word` (capture `parseInt`)
8. `(recent 2);`

### Example C — repair chain
> `select draw the label. cap that. install that. choose two. backspace four. cap draw the label.`

Sequence: find text "draw the label" → capitalize → realize mis-recognition → choose alternate 2 → backspace partial → retype manually.

### Example D — file/window orchestration
> `JDE menu. press enter. find file flashing.html. spell that. choose six. move left 12. move left one. press slash. select. move down seven. embed applet. flashing.class. save buffer. bring up task two. press enter. start Netscape. bring up task two. press enter.`

Single utterance: open JDE menu → enter → open file → correct filename → navigate → insert `/` → select → move → run "embed applet" template → type class name → save → switch to Netscape.

### Example E — compound declaration with `electric end`
> `private static final. press spacebar. integer. sleep no space time. all caps that. all caps that. is assigned value 650 semicolon new line right brace. save buffer.`

Sequence: type modifier chain → type identifier → uppercase it (twice, suggesting `SLEEP_TIME` formation) → assign 650 → close brace → save.

---

## 6. Command Grammar Patterns

### Number arguments
- Cardinals follow the verb: `move down five`, `move right ten`, `backspace four`, `kill six characters`, `delete previous five characters`.
- Bare cardinals after `recent`: `recent two`, `recent eleven`.
- Cache slot numbers go up to at least 20; line numbers are spoken naturally (`46`, `74`).
- `choose <N>` for correction dialog (1–10 seen).

### Letter words
- `letter <natoword>` is explicit single-char insertion: `letter india` → `i`.
- Without `letter` prefix, NATO words after certain commands also act as characters: `press papa`, `press tango`, `press golf`, `press bravo`, `press foxtrot`, `press slash`.
- `jump to … <natoword>` uses the letter as search target.

### Ordinal/positional
- `jump to first <ltr> on <line>` and `jump to last <ltr> on <line>` — first/last occurrence.
- `jump to last <ltr> on current line` / `on previous line` for relative lines.

### Optional prefixes
- Movement verbs require direction word: always `move down/up/left/right`, never just "down".
- Stop word is universal: `stop moving` halts any continuous motion.
- `press <key>` for literal keypresses (enter, slash, single letters).

### Capitalization tokens act as inline filters
`cap`, `no cap`, `all caps`, `no space` are scoped to the *next* token only and can stack: `text no space cap font` → concat with previous, capitalize first letter of next = `textFont`.

### Punctuation always spelled
Even `period` and `comma` are spoken; bare prose is rare except inside `set mark … fill in comment` context.

### Keyword dictionary
Java reserved words (`public`, `private`, `void`, `class`, `extends`, `implements`, `new`, `null`, `false`, `true`, `static`, `final`, `return`, `Integer`, `String`, `Boolean`) recognized directly as code tokens.

### `that` referent
Always refers to the most recent recognition or the current selection:
- `cap that` — capitalize last/selected text
- `all caps that` — uppercase
- `install that` — replace selection with last dictation (likely)
- `spell that` — open spelling-correction dialog for last/selected token

---

## 7. Inferred Macro Architecture

### NatSpeak side (recognition layer)
- **Continuous Command Grammar**: A custom grammar file enumerating verbs (`move`, `jump`, `press`, `select`, `recent`, `cash`, `short jump`, `set mark`, `undo transaction`, etc.) with slot fillers (cardinals, NATO letters, named templates).
- **Letter alphabet sub-grammar**: NATO words mapped to letters, available both standalone (`alpha` → `a`) and after `letter`/`press` prefixes.
- **Number sub-grammar**: cardinals 1–~100 mapped to integers.
- **Action dispatch**: each parsed command emits a string command to Emacs via a side channel (likely a TCP socket, named pipe, or by simulating keypresses that trigger a registered Emacs minor mode).

### Emacs side (execution layer)
A minor mode (let's call it `voice-coder-mode`) providing:

```elisp
;; Navigation primitives
(defun vc-move-down (n) (forward-line n))
(defun vc-move-right (n) (forward-char n))
(defun vc-jump-to-first-char-on-line (char line) ...)
(defun vc-jump-to-last-char-on-current-line (char) ...)
(defun vc-continuous-scroll (dir) ...) ;; with timer; vc-stop kills timer
```

```elisp
;; Cache pad (ring of 20)
(defvar vc-cache-pad (make-vector 20 nil))
(defun vc-cache-push (str) ...) ;; auto-called when identifier is inserted
(defun vc-recent (n) (insert (aref vc-cache-pad (1- n))))
(defun vc-cash-word () (vc-cache-push (current-word)))
(defun vc-cash-region () (vc-cache-push (buffer-substring (region-beginning) (region-end))))
```

```elisp
;; Templates
(defun vc-if-statement ()
  (insert "if (")
  (save-excursion (insert ") {\n\n}\n"))
  (setq vc-short-jump-target (line-end-position 2)))
(defun vc-short-jump () (goto-char vc-short-jump-target))
```

```elisp
;; Transactions
(defun vc-set-mark () (push-mark) (vc-begin-undo-group))
(defun vc-undo-transaction () (primitive-undo (vc-last-group-size) buffer-undo-list))
;; Likely uses `undo-boundary` or atomic-change-group
```

```elisp
;; Correction
(defun vc-spell-that () (vc-open-correction-dialog (vc-last-token)))
(defun vc-choose (n) (vc-replace-with-alternate n))
```

### State held between utterances
- Last-recognized token (for `cap that`, `spell that`)
- Current selection (for `cap that` when selection active)
- Short-jump target (for post-template body landing)
- Mark / undo-group stack
- Cache pad contents (persistent across the session)
- Select-and-Say enabled flag (gates `select <arbitrary text>`)

### Why `select-and-say` is toggled
Dragon's Select-and-Say scans the screen content. When disabled, the grammar is more restrictive and *navigation commands* (especially letter-based jumps) recognize more reliably. The user toggles it on for content-aware selection, off for fast structural editing.

---

## 8. Gaps & Uncertainties

1. **`cash word` vs `cash into sign` vs `cash and assign` vs `cash that` vs `cash region`** — five `cash`-family verbs with overlapping semantics. The exact distinction between `cash word` (capture word) and `cash and assign` (capture LHS and insert `=`) is inferred from context; `cash into sign` could be a Whisper mis-transcription of `cache and assign`.

2. **Auto-push to cache** — it is unclear whether *every* freshly-dictated identifier auto-pushes, or only those captured by explicit `cash word`. The fluidity with which `recent N` is used right after identifier creation suggests auto-push, but explicit `cash word` calls argue for opt-in.

3. **Slot numbering direction** — Is slot 1 always "most recent" (LRU) or is it a fixed slot the user assigns? Behavior is consistent with LRU, but the user seems to track specific slots for specific roles, which would require a more deliberate model.

4. **`short jump` precise semantics** — Sometimes appears to mean "exit current paren group and continue", other times "drop to next line", other times "end of template". Likely context-sensitive based on the most recent template.

5. **`electric end`** — Almost certainly an Emacs "electric mode" key (auto-closing). Exact behavior here (closes brace? terminates statement?) is unclear.

6. **`install that`** — Appears only once; meaning conjectured as "insert the last recognition" (possibly a Dragon-native command, not a voice-coder macro).

7. **`embed applet`** — Either a code template (HTML `<applet>` snippet for the HTML file) or a NatSpeak text macro. The screencast confirms an HTML file edit but the exact expansion isn't visible.

8. **`fill and comment` vs `fill in comment`** — Both spoken forms appear; almost certainly the same macro with Whisper transcription variance.

9. **`all cap that` / `all caps that`** — When applied twice (`all caps that. all caps that.`) it appears to both uppercase *and* insert underscores between camelCase boundaries (turning `sleepTime` → `SLEEP_TIME`). Whether this is one macro called twice with different effects, or two distinct macros, is unclear.

10. **Continuous-motion termination** — Does `stop moving` halt any motion, or only the last-started one? Multiple `move down … stop moving` cycles suggest the former.

11. **Line-number display correlation** — `toggle line numbers` is invoked just before the user starts using `jump to … on <N>` heavily, confirming the numeric jumps rely on a visible line-number column.

12. **Underlying transport** — Whether voice commands reach Emacs via a TCP/socket server, the Windows clipboard, or simulated keystrokes that trigger key-chord macros is not determinable from the recording alone.