import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {

    // ---------------------------------------------------------------------------
    // Components
    // ---------------------------------------------------------------------------
    private var speech:    SpeechEngine!
    private var parser:    CommandParser!
    private var client:    ExtensionClient!
    private var hotkey:    HotkeyMonitor!
    private var overlay:   UtteranceOverlay!
    private var statusItem: NSStatusItem!

    private var mode: Mode = .dictation {
        didSet {
            overlay.setMode(mode.rawValue)
            client.sendSetMode(mode.rawValue)
            updateMenuModeItem()
        }
    }
    private var modeMenuItem: NSMenuItem?

    enum Mode: String { case command, dictation }

    // ---------------------------------------------------------------------------
    // App lifecycle
    // ---------------------------------------------------------------------------

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBar()

        // Load compiled vocabulary
        guard let vocabURL = Bundle.main.url(forResource: "compiled", withExtension: "json",
                                             subdirectory: "Resources") else {
            showError("compiled.json not found in app bundle.\nRun vocab/compile_vocab.py then rebuild.")
            return
        }
        do {
            parser = try CommandParser(compiledJSONURL: vocabURL)
        } catch {
            showError("Failed to load vocabulary: \(error)")
            return
        }

        overlay = UtteranceOverlay()
        client  = ExtensionClient()
        hotkey  = HotkeyMonitor()

        hotkey.onToggle = { [weak self] in self?.toggleMode() }

        client.onCacheUpdate = { items in
            // Mirror cache state locally if needed (e.g. for display in menu)
            _ = items
        }

        speech = SpeechEngine()
        speech.onTranscript = { [weak self] text in self?.handle(transcript: text) }
        speech.onStateChange = { [weak self] state in self?.handleSpeechState(state) }

        speech.requestPermissions { [weak self] granted in
            guard let self else { return }
            if granted {
                self.speech.start()
            } else {
                self.showError("Microphone or speech recognition permission denied.\n" +
                               "Grant access in System Settings → Privacy & Security.")
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Transcript handler — the core dispatch loop
    // ---------------------------------------------------------------------------

    private func handle(transcript: String) {
        overlay.showUtterance(transcript)

        switch mode {

        case .command:
            let result = parser.parseCommand(transcript)
            switch result {
            case .action(let name, let params):
                dispatchAction(name: name, params: params)
            case .insertText(let text):
                client.sendInsertText(text)
            case .noMatch:
                // Optionally: play a short error tone here
                break
            }

        case .dictation:
            // In dictation mode, first check for cache-pad commands
            let cacheCheck = parser.parseCommand(transcript)
            switch cacheCheck {
            case .action(let name, let params)
                where isCacheCommand(name) || isMetaCommand(name):
                dispatchAction(name: name, params: params)
            default:
                // Assemble text with vocab substitutions and insert
                let text = parser.assembleDictationText(transcript)
                client.sendInsertText(text)
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Action dispatcher — converts ParsedCommand.action → ExtensionClient call
    // ---------------------------------------------------------------------------

    private func dispatchAction(name: String, params: [String: Any]) {
        switch name {

        // Navigation
        case "gotoLine":
            client.send(["cmd": "gotoLine", "line": params["N"] ?? 1])
        case "gotoWordOnLine":
            let w = params["W"] ?? params["ORD"] ?? 1
            client.send(["cmd": "gotoWordOnLine", "word": w, "line": params["L"] ?? 1])
        case "selectToken":
            client.send(["cmd": "selectToken", "token": params["TOKEN"] ?? ""])
        case "cursorUpN":
            client.send(["cmd": "cursorUp", "n": params["N"] ?? 1])
        case "cursorDownN":
            client.send(["cmd": "cursorDown", "n": params["N"] ?? 1])

        // Cache pad
        case "insertCacheItem":
            client.send(["cmd": "insertCacheItem", "index": params["N"] ?? 1])
        case "evictCacheItem":
            client.send(["cmd": "evictCacheItem", "index": params["N"] ?? 1])

        // Parameterised editing
        case "deleteChars":
            client.send(["cmd": "deleteChars", "n": params["N"] ?? 1])
        case "selectChars":
            client.send(["cmd": "selectChars", "n": params["N"] ?? 1])
        case "deleteWords":
            client.send(["cmd": "deleteWords", "n": params["N"] ?? 1])

        // Everything else is a 1:1 command name
        default:
            client.sendAction(name, params: params)
        }
    }

    // Returns true for action names that should be honoured even in dictation mode
    private func isCacheCommand(_ name: String) -> Bool {
        ["insertCacheItem", "cacheCurrentWord", "refreshCachePad",
         "evictCacheItem", "clearCachePad"].contains(name)
    }
    private func isMetaCommand(_ name: String) -> Bool {
        ["undo", "redo", "save"].contains(name)
    }

    // ---------------------------------------------------------------------------
    // Mode toggle (hotkey callback)
    // ---------------------------------------------------------------------------

    private func toggleMode() {
        mode = (mode == .command) ? .dictation : .command
    }

    // ---------------------------------------------------------------------------
    // Menu bar
    // ---------------------------------------------------------------------------

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let btn = statusItem.button {
            btn.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "Voice Coder")
        }

        let menu = NSMenu()

        let titleItem = NSMenuItem(title: "Voice Coder", action: nil, keyEquivalent: "")
        titleItem.isEnabled = false
        menu.addItem(titleItem)
        menu.addItem(.separator())

        let modeItem = NSMenuItem(title: modeTitle, action: #selector(toggleModeFromMenu), keyEquivalent: "")
        modeItem.target = self
        modeMenuItem = modeItem
        menu.addItem(modeItem)

        menu.addItem(.separator())

        let reconnectItem = NSMenuItem(title: "Reconnect to VSCode", action: #selector(reconnect), keyEquivalent: "")
        reconnectItem.target = self
        menu.addItem(reconnectItem)

        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))

        statusItem.menu = menu
    }

    @objc private func toggleModeFromMenu() { toggleMode() }
    @objc private func reconnect() { client = ExtensionClient() }

    private var modeTitle: String {
        mode == .command ? "● Command mode (F5 to switch)" : "○ Dictation mode (F5 to switch)"
    }

    private func updateMenuModeItem() {
        modeMenuItem?.title = modeTitle
    }

    // ---------------------------------------------------------------------------
    // Speech state handling
    // ---------------------------------------------------------------------------

    private func handleSpeechState(_ state: SpeechEngine.State) {
        switch state {
        case .idle:
            statusItem.button?.image = NSImage(systemSymbolName: "mic.slash", accessibilityDescription: "Voice Coder (idle)")
        case .listening:
            statusItem.button?.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "Voice Coder (listening)")
        case .error(let msg):
            statusItem.button?.image = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "Voice Coder (error)")
            showError("Speech engine error: \(msg)")
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private func showError(_ msg: String) {
        DispatchQueue.main.async {
            let alert = NSAlert()
            alert.messageText     = "Voice Coder"
            alert.informativeText = msg
            alert.alertStyle      = .warning
            alert.runModal()
        }
    }
}
