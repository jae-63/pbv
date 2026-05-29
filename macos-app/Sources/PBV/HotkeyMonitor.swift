import CoreGraphics
import AppKit

// Installs a CGEventTap to intercept a configurable key globally.
// Default: F5 (keyCode 96). The event is consumed — it does not reach the frontmost app.
// Requires Accessibility permission (System Settings → Privacy & Security → Accessibility).

final class HotkeyMonitor {
    var onToggle: (() -> Void)?
    let hotKeyCode: Int64     // CGKeyCode stored as Int64 for C-callback bridge
    private var eventTap:   CFMachPort?
    private var runLoopSrc: CFRunLoopSource?

    init(keyCode: CGKeyCode = 96 /* F5 */) {
        self.hotKeyCode = Int64(keyCode)
        guard AXIsProcessTrusted() else {
            print("PBV: F5 hotkey disabled — add this binary in System Settings → Privacy & Security → Accessibility, then restart.")
            return
        }
        installTap()
    }

    private func installTap() {
        let selfPtr = Unmanaged.passRetained(self).toOpaque()
        let mask    = CGEventMask(1 << CGEventType.keyDown.rawValue)

        guard let tap = CGEvent.tapCreate(
            tap:              .cgSessionEventTap,
            place:            .headInsertEventTap,
            options:          .defaultTap,
            eventsOfInterest: mask,
            callback:         hotkeyEventCallback,
            userInfo:         selfPtr
        ) else {
            print("PBV: failed to create CGEventTap (accessibility permission denied?)")
            Unmanaged<HotkeyMonitor>.fromOpaque(selfPtr).release()
            return
        }
        eventTap   = tap
        runLoopSrc = CFMachPortCreateRunLoopSource(nil, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSrc, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    deinit {
        if let tap = eventTap { CGEvent.tapEnable(tap: tap, enable: false) }
        if let src = runLoopSrc { CFRunLoopRemoveSource(CFRunLoopGetMain(), src, .commonModes) }
    }
}

// C-compatible callback — must be a top-level or global function.
private func hotkeyEventCallback(
    proxy:    CGEventTapProxy,
    type:     CGEventType,
    event:    CGEvent,
    userInfo: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    guard type == .keyDown, let ptr = userInfo else {
        return Unmanaged.passRetained(event)
    }
    let monitor = Unmanaged<HotkeyMonitor>.fromOpaque(ptr).takeUnretainedValue()
    let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
    if keyCode == monitor.hotKeyCode {
        DispatchQueue.main.async { monitor.onToggle?() }
        return nil  // consume the event
    }
    return Unmanaged.passRetained(event)
}
