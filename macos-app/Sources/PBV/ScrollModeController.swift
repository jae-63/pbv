import AppKit
import CoreGraphics

// Key codes for arrow keys (from HIToolbox/Events.h)
private let kVK_DownArrow:  CGKeyCode = 125
private let kVK_UpArrow:    CGKeyCode = 126
private let kVK_LeftArrow:  CGKeyCode = 123
private let kVK_RightArrow: CGKeyCode = 124

// ---------------------------------------------------------------------------
// ScrollModeController
//
// Owns the scroll/traverse timer, speed state, and blink state.
// Sends Ctrl+Arrow keystrokes globally via CGEventPost.
// Calls back on every blink tick so AppDelegate can update the status-bar icon.
//
// All methods must be called on the main thread.
// ---------------------------------------------------------------------------

final class ScrollModeController {

    enum Mode: Equatable {
        case off
        case scroll(direction: String)
        case traverse
    }

    // Called on every timer tick with the SF symbol name to display.
    var onIconChange: ((String) -> Void)?

    private(set) var mode: Mode = .off

    private var interval: TimeInterval = 1.0
    private var timer:    DispatchSourceTimer?
    private var blink     = false

    // MARK: - Entry / exit

    func enter(scrollDirection direction: String) {
        requestAccessibilityIfNeeded()
        mode     = .scroll(direction: direction)
        interval = 1.0
        restartTimer()
    }

    func enterTraverse() {
        requestAccessibilityIfNeeded()
        mode     = .traverse
        interval = 1.0
        restartTimer()
    }

    // Prompt for Accessibility permission the first time scroll/traverse is used.
    // Deferred from app launch so it doesn't appear on every cold start.
    private func requestAccessibilityIfNeeded() {
        guard !AXIsProcessTrusted() else { return }
        AXIsProcessTrustedWithOptions(
            [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary)
    }

    func exit() {
        mode = .off
        stopTimer()
    }

    var isActive: Bool { mode != .off }

    // MARK: - Speed control

    func faster() { interval = max(0.2, interval * 0.75); restartTimer() }
    func slower() { interval = min(4.0, interval * 1.33); restartTimer() }

    // MARK: - Timer

    private func restartTimer() {
        stopTimer()
        let t = DispatchSource.makeTimerSource(queue: .main)
        t.schedule(deadline: .now() + interval, repeating: interval)
        t.setEventHandler { [weak self] in self?.tick() }
        t.resume()
        timer = t
    }

    private func stopTimer() {
        timer?.cancel()
        timer = nil
        blink  = false
    }

    private func tick() {
        blink.toggle()
        emitIcon()
        postKeystroke()
    }

    // MARK: - Icon

    private func emitIcon() {
        let name: String
        switch mode {
        case .off:
            name = "mic.fill"
        case .scroll(let dir):
            name = blink ? arrowSymbol(dir) : "mic.fill"
        case .traverse:
            name = blink ? "list.bullet.indent" : "mic.fill"
        }
        onIconChange?(name)
    }

    private func arrowSymbol(_ direction: String) -> String {
        switch direction {
        case "up":    return "arrow.up.circle.fill"
        case "left":  return "arrow.left.circle.fill"
        case "right": return "arrow.right.circle.fill"
        default:      return "arrow.down.circle.fill"
        }
    }

    // MARK: - CGEvent keystroke

    private func postKeystroke() {
        let keyCode: CGKeyCode
        switch mode {
        case .off: return
        case .traverse:              keyCode = kVK_DownArrow
        case .scroll(let dir):
            switch dir {
            case "up":    keyCode = kVK_UpArrow
            case "left":  keyCode = kVK_LeftArrow
            case "right": keyCode = kVK_RightArrow
            default:      keyCode = kVK_DownArrow
            }
        }

        guard let src = CGEventSource(stateID: .hidSystemState),
              let dn  = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: true),
              let up  = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: false)
        else { return }

        dn.flags = .maskControl
        up.flags = .maskControl
        dn.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }
}
