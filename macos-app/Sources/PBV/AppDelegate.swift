import AppKit
import AVFoundation

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {

    // ---------------------------------------------------------------------------
    // Components
    // ---------------------------------------------------------------------------
    private var speech:     SpeechEngine!
    private var client:     ExtensionClient!
    private var hotkey:     HotkeyMonitor!
    private var overlay:    UtteranceOverlay!
    private var statusItem: NSStatusItem!
    private let scroll      = ScrollModeController()

    private var mode: Mode = .command {
        didSet {
            overlay.setMode(mode.rawValue)
            client.sendSetMode(mode.rawValue)
            updateMenuModeItem()
        }
    }
    private var speechReady  = false
    private var micSleeping  = false
    private var modeMenuItem:  NSMenuItem?
    private var micMenuItem:   NSMenuItem?
    private var sleepMenuItem: NSMenuItem?

    enum Mode: String { case command, dictation }

    // ---------------------------------------------------------------------------
    // App lifecycle
    // ---------------------------------------------------------------------------

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBar()

        // Accessibility permission check is deferred to first scroll/traverse command
        // (see ScrollModeController.requestAccessibilityIfNeeded) so it doesn't prompt
        // on every launch.

        scroll.onIconChange = { [weak self] name in
            guard let self else { return }
            self.statusItem.button?.image = NSImage(
                systemSymbolName: name, accessibilityDescription: "PBV")
        }

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
        NSLog("[PBV] transcript: %@", transcript)
        overlay.showUtterance(transcript)
        if handleScrollCommand(transcript) { return }
        client.sendTranscript(transcript)
    }

    // Returns true if the transcript was consumed by scroll/traverse mode.
    // When scroll mode is active, any unrecognised utterance is silently dropped
    // (the user must say "stop scrolling" before issuing other commands).
    @discardableResult
    private func handleScrollCommand(_ raw: String) -> Bool {
        // Strip ALL punctuation (not just from edges), collapse spaces, lowercase.
        // Whisper sometimes adds periods mid-phrase or surrounding words.
        let stripped = raw.unicodeScalars
            .filter { !CharacterSet.punctuationCharacters.contains($0) }
        let text = String(stripped)
            .lowercased()
            .components(separatedBy: .whitespaces)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        NSLog("[PBV] handleScrollCommand raw=%@ normalized=%@", raw, text)
        switch text {
        case "scroll down", "hold down":
            scroll.enter(scrollDirection: "down")
            client.send(["cmd": "enterScrollMode", "direction": "down"])
            return true
        case "scroll up", "hold up":
            scroll.enter(scrollDirection: "up")
            client.send(["cmd": "enterScrollMode", "direction": "up"])
            return true
        case "scroll left", "hold left":
            scroll.enter(scrollDirection: "left")
            client.send(["cmd": "enterScrollMode", "direction": "left"])
            return true
        case "scroll right", "hold right":
            scroll.enter(scrollDirection: "right")
            client.send(["cmd": "enterScrollMode", "direction": "right"])
            return true
        case "traverse definitions", "traverse definition":
            scroll.enterTraverse()
            client.send(["cmd": "enterTraversalMode"])
            return true
        case "faster":
            guard scroll.isActive else { return false }
            scroll.faster()
            return true
        case "slower":
            guard scroll.isActive else { return false }
            scroll.slower()
            return true
        case "stop", "stop scrolling":
            guard scroll.isActive else { return false }
            scroll.exit()
            client.send(["cmd": "exitScrollMode"])
            restoreScrollIcon()
            return true
        default:
            return scroll.isActive  // drop anything else while scrolling
        }
    }

    private func restoreScrollIcon() {
        let name = speechReady ? "mic.fill" : "mic.slash"
        statusItem.button?.image = NSImage(systemSymbolName: name, accessibilityDescription: "PBV")
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

        let sleepItem = NSMenuItem(title: sleepTitle, action: #selector(toggleSleep), keyEquivalent: "")
        sleepItem.target = self
        sleepMenuItem = sleepItem
        menu.addItem(sleepItem)

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

    @objc private func toggleSleep() {
        micSleeping.toggle()
        if micSleeping {
            speech.stop()
        } else {
            speech.start()
        }
        sleepMenuItem?.title = sleepTitle
    }

    private var sleepTitle: String {
        micSleeping ? "Wake Mic" : "Sleep Mic"
    }

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
            client.sendSetReady(false)
            if !scroll.isActive {
                statusItem.button?.image = NSImage(systemSymbolName: "mic.slash", accessibilityDescription: "PBV (idle)")
            }
        case .listening:
            speechReady = true
            client.sendSetReady(true)
            if !scroll.isActive {
                statusItem.button?.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "PBV (listening)")
            }
        case .error(let msg):
            speechReady = false
            client.sendSetReady(false)
            if !scroll.isActive {
                statusItem.button?.image = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "PBV (error)")
            }
            showError("Speech engine error: \(msg)")
        }
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    func menuWillOpen(_ menu: NSMenu) {
        micMenuItem?.title   = micLabel
        sleepMenuItem?.title = sleepTitle
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
