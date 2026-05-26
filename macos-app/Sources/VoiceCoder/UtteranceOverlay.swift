import AppKit

// Small always-on-top HUD that echoes the last recognised utterance and current mode.
// Reproduces the "title bar echo" from the original Emacs/Dragon demo.

final class UtteranceOverlay {

    private let panel: NSPanel
    private let modeLabel:      NSTextField
    private let utteranceLabel: NSTextField
    private var hideTimer: Timer?

    init() {
        let width: CGFloat  = 520
        let height: CGFloat = 44
        let rect = NSRect(x: 0, y: 0, width: width, height: height)

        panel = NSPanel(
            contentRect: rect,
            styleMask:   [.borderless, .nonactivatingPanel],
            backing:     .buffered,
            defer:       false
        )
        panel.level             = .floating
        panel.isOpaque          = false
        panel.backgroundColor   = NSColor.black.withAlphaComponent(0.75)
        panel.ignoresMouseEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary]

        // Rounded corners via layer
        panel.contentView?.wantsLayer = true
        panel.contentView?.layer?.cornerRadius = 8

        // Mode badge (left side)
        modeLabel = NSTextField(labelWithString: "DICTATION")
        modeLabel.font            = .monospacedSystemFont(ofSize: 11, weight: .bold)
        modeLabel.textColor       = NSColor(calibratedRed: 0.4, green: 0.9, blue: 0.4, alpha: 1)
        modeLabel.backgroundColor = .clear
        modeLabel.isBezeled       = false
        modeLabel.translatesAutoresizingMaskIntoConstraints = false

        // Utterance text (right of mode badge)
        utteranceLabel = NSTextField(labelWithString: "")
        utteranceLabel.font            = .monospacedSystemFont(ofSize: 12, weight: .regular)
        utteranceLabel.textColor       = .white
        utteranceLabel.backgroundColor = .clear
        utteranceLabel.isBezeled       = false
        utteranceLabel.lineBreakMode   = .byTruncatingTail
        utteranceLabel.translatesAutoresizingMaskIntoConstraints = false

        let contentView = panel.contentView!
        contentView.addSubview(modeLabel)
        contentView.addSubview(utteranceLabel)

        NSLayoutConstraint.activate([
            modeLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 12),
            modeLabel.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            modeLabel.widthAnchor.constraint(equalToConstant: 80),

            utteranceLabel.leadingAnchor.constraint(equalTo: modeLabel.trailingAnchor, constant: 8),
            utteranceLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -12),
            utteranceLabel.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
        ])

        positionPanel()
        panel.orderFront(nil)
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    func setMode(_ mode: String) {
        DispatchQueue.main.async {
            if mode == "command" {
                self.modeLabel.stringValue = "COMMAND"
                self.modeLabel.textColor   = NSColor(calibratedRed: 1, green: 0.6, blue: 0.1, alpha: 1)
            } else {
                self.modeLabel.stringValue = "DICTATION"
                self.modeLabel.textColor   = NSColor(calibratedRed: 0.4, green: 0.9, blue: 0.4, alpha: 1)
            }
        }
    }

    func showUtterance(_ text: String) {
        DispatchQueue.main.async {
            self.utteranceLabel.stringValue = text
            self.hideTimer?.invalidate()
            // Clear utterance text after 4 s
            self.hideTimer = Timer.scheduledTimer(withTimeInterval: 4.0, repeats: false) { [weak self] _ in
                self?.utteranceLabel.stringValue = ""
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------

    private func positionPanel() {
        guard let screen = NSScreen.main else { return }
        // Top-right, below the macOS menu bar (approx 24 pt)
        let x = screen.frame.maxX - panel.frame.width - 16
        let y = screen.frame.maxY - 24 - panel.frame.height - 4
        panel.setFrameOrigin(NSPoint(x: x, y: y))
    }
}
