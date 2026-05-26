# Voice-Coding Demo Analysis: Dragon NaturallySpeaking + Emacs + Perl (circa 2000)

*Source: ~/Downloads/perl1animation.mp4 (~41 min). Analyzed via 40 scene-change frames extracted with ffmpeg, sent to claude-opus-4-7. Cost: ~$0.40. Do not re-run; use this document.*

---

## 1. Overall System Description

The user is demonstrating a voice-driven programming environment where they author a Perl script (`biasvocabulary.pl`) almost entirely by speaking. The workflow visible across frames:

- They start in Windows Explorer browsing `H:\Program Files\Apache Group\Apache\htdocs\pbvdemos\`, create a shortcut to a `perl1` folder.
- They switch to Emacs (Lisp Interaction `*scratch*` buffer initially, then CPerl mode editing `biasvocabulary.pl`).
- The Emacs frame uses a **green background with syntax-colored tokens** (high-contrast theme).
- Code is built up incrementally line by line, growing from ~16 lines to ~119 lines across the session.
- A floating tooltip/title bar at the top of each frame shows the **last recognized utterance** (e.g. "dollar-sign letter-kilo bravo underscore target cache and assign 2 048 semicolon New-Line").

The Perl program being written generates "biased" training text and vocabulary for NaturallySpeaking, by sampling words from existing NatSpeak training files and mixing in custom symbol/word lists at a configurable bias level.

---

## 2. Command Vocabulary

### Symbol/character dictation (NATO phonetic style)
- `letter-kilo`, `letter-romeo`, `letter-november` → literal letters `k`, `r`, `n`
- `bravo` → `b`
- `dollar-sign` → `$`
- `at-sign` → `@`
- `underscore` → `_`
- `semicolon` → `;`
- `comma` → `,`
- `close-quote` / `close-quotes` → `"`
- `left-paren`, `right-paren` → `(`, `)`
- `backslash` → `\`
- `spacebar` / `space-bar` → ` `
- `period` → `.`
- `New-Line` → newline + auto-indent
- `\r\n` spoken as `backslash letter-romeo backslash letter-november`

### Numeric/value dictation
- "2 048" → `2048` (digits spoken with space delimiter)
- "0 point 70" → `0.70`

### Assignment / operators
- `and assign` → ` = `
- `equal two` / `equals` → `==`
- `less equal to`, `not equal two`, `greater than`, `is equal to` — usable as operators and also appear as spoken-form vocabulary entries

### Identifier construction
- Multi-word identifiers spoken as separate words, auto-joined with underscores: "color underscore symbols" → `color_symbols`
- CamelCase variant exists

### Editing commands
- `Kill 8 Characters` — delete N characters
- `Move Down 1` / `move down` — cursor down
- `Press page-up` — emulate keypress
- `Select equal two` — select token by content
- `Search` — invokes Emacs isearch
- `Start Transaction` — groups utterances into one undoable unit
- `Update cache` — refreshes cache pad contents
- `Spell That` — opens Correction dialog for character-by-character spelling
- `Select <word>` — select a visible token by name

### Correction dialog
- Standard NatSpeak Correction box: numbered list of alternates (1–10) with OK / Cancel / Train… / Play Back / Help.

---

## 3. Cache Pad

The **CACHEPAD** is a separate Emacs buffer (`*CACHEPAD*`) pinned to the right of the main code buffer.

- **Contents**: numbered list `(1) … (2) … (3) …` of identifiers currently "in scope" for quick voice reference. Items truncated with `$` at column edge when too long.
- **Population**: updates automatically as code is written. Early frames show 3 entries; later frames show up to 20. "Update cache" utterance refreshes it. Highlighted entries correspond to identifiers recently used near the cursor.
- **Reference mechanism**: user can say the cache item by name (e.g. "range underscore values") as a known token. Numbering `(1)`–`(20)` allows "Cache 7" or "Recent 7" to insert item #7. This is corroborated by `%range_words` hash containing `"*recent%02d*" => "Recent %d"` and `"*scalar%02d*" => "Scalar %d"` templates — voice-command-name patterns for indexed cache slots.
- **Purpose**: solves the hardest problem in voice coding — re-entering long arbitrary identifiers without spelling. Once a symbol is in the cache, it's a first-class vocabulary word.

---

## 4. Navigation

- **Line numbers**: visible in left gutter; modeline always shows `L<n>`.
- **"Move Down N" / "Move Up N"**: relative line motion by count.
- **"Press page-up"**: page-granularity motion.
- **Select-by-content**: "Select equal two" jumps selection to that token.
- **Kill/Select N Characters**: operate on character runs from point.
- **Recent/Scalar N**: cache-pad numbered indexes give a stable short handle to any recently-used identifier.
- **Isearch**: full Emacs incremental search invoked by voice.

---

## 5. Mode Switching

- Emacs modeline shows `(CPerl Abbrev)` normally and `(CPerl VR:on Abbrev)` when voice recognition is active. **`VR:on`** is a per-buffer toggle — explicit mode switch visible at all times.
- "Spell That" opens Correction dialog as a spell-mode entry point.
- "Start Transaction" brackets a group of voice commands atomically.
- NATO phonetic alphabet (`letter-kilo`, `bravo`, etc.) is always-available in VR mode — single letters inline mid-statement without entering explicit spell mode.
- Punctuation names (`semicolon`, `comma`, `dollar-sign`) are always literal in VR mode.
- `\No-Space` token in correction alternates controls whether recognizer inserts whitespace between tokens — transient micro-mode.

---

## 6. Other Design Concepts Worth Carrying Forward

- **Bias training**: feed the recognizer a generated corpus mixing high-frequency English words with domain-specific tokens at a configurable `$bias_level` (0.70 in demo). Makes recognizer good at code-shaped utterances without ruining its English model. *Less relevant with modern neural recognizers but worth noting.*
- **Spoken-form / written-form pairs as first-class data**: every identifier is a (spoken, written) tuple. Custom defaults like "cache word", "is assigned value", "set mark", "search forward" are bound to written tokens. Editor commands are given written forms so they can be dictated naturally.
- **Asterisk-wrapping convention for command tokens**: `"*recent01*"` — internal command names bracketed with asterisks to distinguish from ordinary text.
- **Range words**: a single spoken pattern ("Recent N") expands to many indexed variants via sprintf and a configurable index range (1–20). Keeps vocabulary compact while supporting 20 indexed slots.
- **Single-default-written-words**: words whose written form equals spoken form minus spaces, wrapped in asterisks — a default rule handling bulk of command vocabulary mechanically.
- **Utterance echo in title bar**: small UX feature with large value — the user sees exactly what the recognizer heard before deciding whether to accept or correct.

---

## 7. UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Last recognized utterance shown in Emacs title bar — live feedback]    │
├──────────────────────────────────────────────────┬──────────────────────┤
│ Emacs (CPerl) — h:/…/htdocs/pbvdemos/           │ *CACHEPAD*           │
├──────────────────────────────────────────────────┼──────────────────────┤
│                                                  │ (1) byte_length      │
│   $words_per_line = 8;                           │ (2) rand             │
│   $sample_text_directory = "c:/NatSpeak/…";      │ (3) int              │
│   …                                              │ (4) special_length   │
│   foreach $_ (@allfiles) {                       │ (5) standard_length  │
│     if (m/data\d*.bin/) {                        │ (6) range_values     │
│       ...                                        │ (7) standard_lynx    │
│   [cursor █]                                     │ …                    │
│                                                  │ (20) allfiles        │
│ Green background, syntax-highlighted             │ Hatched background   │
│                                                  │ items highlighted    │
│                                                  │ when recently used   │
├──────────────────────────────────────────────────┼──────────────────────┤
│ -- biasvocabulary.pl  (CPerl VR:on Abbrev)--L107--Bot--  │ *CACHEPAD*  │
└─────────────────────────────────────────────────────────────────────────┘
```

Key layout features:
- **Two side-by-side Emacs windows**: left = code buffer (~75% width), right = persistent `*CACHEPAD*` buffer (~25%).
- **Floating utterance tooltip**: Emacs title bar repurposed to echo the most recent recognized phrase. Critical feedback loop.
- **Modeline carries mode state**: `(CPerl VR:on Abbrev)` vs `(CPerl Abbrev)` distinguishes voice-on/off; position shown as `--Bot`, `--69%--`, `L107`.
- **Correction dialog**: native NatSpeak modal — numbered alternates list — overlays editor on "Spell That".
- **Color scheme**: green canvas, syntax-highlighted, cache pad uses hatched background to visually separate it.

---

## Notes for the Modern Mac/VSCode Rebuild

- Cache pad → VSCode side panel (webview) listing recently-introduced identifiers with numeric quick-pick handles ("Cache 7" → insert).
- **Content-based selection** ("Select equal two") was a Dragon NaturallySpeaking native feature, not something built in the original system. On Mac there is no equivalent native capability. Implementation path: VSCode extension exposes a `selectToken(text)` command; the Swift app sends the recognized token string to the extension. Non-trivial to get right (partial matches, multiple occurrences) — build after core system is working.
- `VR:on` per-editor toggle → status bar item in VSCode showing current mode (command vs. dictation), toggled by function key.
- Utterance echo in title bar → VSCode status bar item or transient notification showing last recognized phrase.
- NATO phonetic + always-literal-punctuation grammar inside command mode is still the right default for code dictation.
- Spoken-form/written-form table should be a user-editable data file (YAML or JSON).
- Bias-corpus generation is obsolete with modern neural recognizers (SFSpeechRecognizer on-device).
- "Start Transaction" → undo grouping in VSCode editor API.
- `\No-Space` micro-mode → a flag in the command parser controlling whether a space is inserted before the next token.
