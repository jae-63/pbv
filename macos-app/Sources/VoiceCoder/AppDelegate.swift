import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {

    // ---------------------------------------------------------------------------
    // Components
    // ---------------------------------------------------------------------------
    private var speech:    SpeechEngine!
    private var client:    ExtensionClient!
    private var hotkey:    HotkeyMonitor!
    private var overlay:   UtteranceOverlay!
    private var statusItem: NSStatusItem!

    private var mode: Mode = .command {
        didSet {
            overlay.setMode(mode.rawValue)
            client.sendSetMode(mode.rawValue)
            updateMenuModeItem()
        }
    }
    private var speechReady = false
    private var modeMenuItem: NSMenuItem?
    private var micMenuItem:  NSMenuItem?

    enum Mode: String { case command, dictation }

    // ---------------------------------------------------------------------------
    // App lifecycle
    // ---------------------------------------------------------------------------

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBar()

        overlay = UtteranceOverlay()
        client  = ExtensionClient()
        // Sync initial mode to overlay (didSet doesn't fire on declaration)
        overlay.setMode(mode.rawValue)
        // Re-sync mode and ready state whenever the connection (re)establishes.
        client.onConnectionReady = { [weak self] in
            guard let self else { return }
            self.client.sendSetMode(self.mode.rawValue)
            self.client.sendSetReady(self.speechReady)
        }
        // F5 hotkey requires a .app bundle — disabled for plain-binary testing.
        // hotkey  = HotkeyMonitor()
        // hotkey.onToggle = { [weak self] in self?.toggleMode() }

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
    // Transcript handler — forward raw speech to VSCode for Claude interpretation
    // ---------------------------------------------------------------------------

    private func handle(transcript: String) {
        NSLog("[VoiceCoder] transcript: %@", transcript)
        overlay.showUtterance(transcript)
        client.sendTranscript(transcript)
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
        menu.delegate = self

        let titleItem = NSMenuItem(title: "Voice Coder", action: nil, keyEquivalent: "")
        titleItem.isEnabled = false
        menu.addItem(titleItem)
        menu.addItem(.separator())

        let modeItem = NSMenuItem(title: modeTitle, action: #selector(toggleModeFromMenu), keyEquivalent: "")
        modeItem.target = self
        modeMenuItem = modeItem
        menu.addItem(modeItem)

        menu.addItem(.separator())

        let micItem = NSMenuItem(title: micLabel, action: nil, keyEquivalent: "")
        micItem.isEnabled = false
        micMenuItem = micItem
        menu.addItem(micItem)

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

    private var micLabel: String {
        let name = AVCaptureDevice.default(for: .audio)?.localizedName ?? "Unknown"
        return "Mic: \(name)"
    }

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
            speechReady = false
            statusItem.button?.image = NSImage(systemSymbolName: "mic.slash", accessibilityDescription: "Voice Coder (idle)")
            client.sendSetReady(false)
        case .listening:
            speechReady = true
            statusItem.button?.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "Voice Coder (listening)")
            client.sendSetReady(true)
        case .error(let msg):
            speechReady = false
            statusItem.button?.image = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "Voice Coder (error)")
            client.sendSetReady(false)
            showError("Speech engine error: \(msg)")
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    func menuWillOpen(_ menu: NSMenu) {
        micMenuItem?.title = micLabel
    }

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
