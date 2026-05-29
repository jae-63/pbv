import AppKit

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
    // Called on every timer tick to advance the scroll/traversal step.
    // true = forward (down), false = backward (up).
    var onScrollTick: ((Bool) -> Void)?

    private(set) var mode: Mode = .off

    private var interval: TimeInterval = 0.5
    private var timer:    DispatchSourceTimer?
    private var blink     = false

    // MARK: - Entry / exit

    func enter(scrollDirection direction: String) {
        mode     = .scroll(direction: direction)
        interval = 1.0
        restartTimer()
    }

    func enterTraverse() {
        mode     = .traverse
        interval = 1.0
        restartTimer()
    }


    func exit() {
        mode = .off
        stopTimer()
    }

    var isActive: Bool { mode != .off }

    // MARK: - Speed control

    func faster()     { interval = max(0.2,  interval * 0.75);             restartTimer() }
    func muchFaster() { interval = max(0.2,  interval * 0.75 * 0.75 * 0.75); restartTimer() }
    func slower()     { interval = min(4.0,  interval * 1.33);             restartTimer() }
    func muchSlower() { interval = min(4.0,  interval * 1.33 * 1.33 * 1.33); restartTimer() }

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
        let forward: Bool
        if case .scroll(let dir) = mode { forward = (dir != "up") } else { forward = true }
        onScrollTick?(forward)
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

}
