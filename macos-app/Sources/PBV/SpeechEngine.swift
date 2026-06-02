import AVFoundation
import CoreAudio
import Foundation
import Network

// Whisper-backed speech engine.
//
// On start(), launches whisper-server as a background process (model stays
// resident — no per-utterance load cost). AVAudioEngine captures 16 kHz mono
// PCM; an energy threshold gates silence; on the silence timer the buffered
// frames are POSTed to whisper-server and the transcript is returned.

final class SpeechEngine: NSObject {

    var onTranscript:  ((String, Bool) -> Void)?   // (text, lowConfidence)
    var onStateChange: ((State) -> Void)?
    enum State { case idle, listening, error(String) }

    // ---------------------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------------------

    // whisper-server runs as a LaunchAgent (com.voicecoder.whisper) on this port.
    private let serverPort  = 8765

    // Initial prompt — biases Whisper toward our command vocabulary.
    // Phrased as natural command utterances so the model learns the pattern.
    private static let whisperPrompt =
        // Navigation & editing
        "Go to line 75. Line 32. Cursor up 5. Cursor down 3. Page up. Page down. " +
        "Delete word. Delete line. Delete 3 words. Delete to end. " +
        "Set mark. Undo transaction. Undo. Redo. Save. Format document. " +
        "Comment line. Select all. Copy. Cut. Paste. " +
        "Word 3 on line 68. Go to top. Go to bottom. End of line. Home. " +
        "Scroll down. Scroll up. Stop scrolling. Faster. Slower. " +
        "Traverse definitions. Jump to mark. Jump back. Cache this. " +
        // Dictation commands and modifiers
        "Dictate import argparse. Dictate from pathlib import Path. " +
        "Dictation mode. Command mode. New line. Letter romeo. Letter echo. " +
        // Word modifiers — repeated in varied contexts so Whisper learns them as commands
        "Cap Path. Cap dict. No-space dict. No-space cap dict. " +
        "From pathlib import cap Path. From collections import default no-space dict. " +
        // Python templates — listed so Whisper learns the vocabulary
        "Shebang. Python shebang. Module doc. Main guard. Sys exit. " +
        "Define function. Define method. For loop. While loop. " +
        "If block. Elif block. Else block. Try except. With block. " +
        "List comprehension. Dict comprehension. F string. Raw string. " +
        "Function doc. Go doc. New file. Close file. Save as. " +
        "Next file. Previous file. Reopen file. Clear cache pad. Show commands."
    private var serverURL:  URL { URL(string: "http://127.0.0.1:\(serverPort)/inference")! }

    // When true (default), pins AVAudioEngine input to the built-in mic.
    // Set false to allow AirPods to be used as mic (better SNR, but degrades
    // AirPods audio output quality by switching them to HFP/SCO mode).
    var preferBuiltInMic: Bool = false

    // RMS below this level is treated as silence and not sent to Whisper.
    private let energyThreshold: Float = 0.002

    // Silence timeout — wait this long after last audio before transcribing.
    private let silenceDelay: TimeInterval = 0.8

    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------

    private var audioEngine  = AVAudioEngine()
    private var frames       = [AVAudioPCMBuffer]()
    private var silenceTimer: DispatchWorkItem?
    private var isRunning    = false
    private var isRestarting = false
    private var tapInstalled = false

    // Health check — detects "engine running but capturing from dead/wrong device."
    // A live mic always has a background-noise floor; exactly-zero RMS means the
    // tap is connected to a device that isn't producing audio (post-phone-call state).
    private var healthCheck:       DispatchWorkItem?
    private var healthFrameCount:  Int   = 0
    private var healthEnergySum:   Float = 0

    // ---------------------------------------------------------------------------
    // Permissions — only mic needed now (no SFSpeechRecognizer)
    // ---------------------------------------------------------------------------

    func requestPermissions(completion: @escaping (Bool) -> Void) {
        NSLog("[PBV] requestPermissions: asking mic auth")
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            NSLog("[PBV] requestPermissions: mic granted=%d", granted ? 1 : 0)
            DispatchQueue.main.async { completion(granted) }
        }
    }

    // ---------------------------------------------------------------------------
    // Start / stop
    // ---------------------------------------------------------------------------

    func start() {
        guard !isRunning else { return }
        isRunning = true
        // whisper-server runs as a LaunchAgent — just wait for it to be ready.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let ready = self.waitForServer()
            DispatchQueue.main.async {
                if ready {
                    self.startAudioEngine()
                } else {
                    self.onStateChange?(.error(
                        "whisper-server not reachable on port \(self.serverPort). " +
                        "Run: launchctl load ~/Library/LaunchAgents/com.voicecoder.whisper.plist"))
                }
            }
        }
    }

    func stop() {
        isRunning = false
        silenceTimer?.cancel()
        silenceTimer = nil
        healthCheck?.cancel()
        healthCheck = nil
        frames.removeAll()
        NotificationCenter.default.removeObserver(
            self, name: .AVAudioEngineConfigurationChange, object: audioEngine)
        if audioEngine.isRunning { audioEngine.stop() }
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        onStateChange?(.idle)
    }

    private func restartAudioEngine() {
        guard isRunning, !isRestarting else { return }
        isRestarting = true
        // Signal not-ready while we reconfigure.
        onStateChange?(.idle)
        frames.removeAll()
        silenceTimer?.cancel()
        silenceTimer = nil
        healthCheck?.cancel()
        healthCheck = nil
        NotificationCenter.default.removeObserver(
            self, name: .AVAudioEngineConfigurationChange, object: audioEngine)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        // Longer pause: AirPods take several seconds to fully hand off to the
        // built-in mic. -10868 fires if we try before the hardware settles.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            self?.isRestarting = false
            self?.startAudioEngine()
        }
    }

    // Returns true when whisper-server is accepting TCP connections on serverPort.
    // TCP connect is instant and doesn't block waiting for an HTTP response.
    private func waitForServer(attempts: Int = 60) -> Bool {
        for _ in 0..<attempts {
            if tcpPortOpen(port: UInt16(serverPort)) { return true }
            Thread.sleep(forTimeInterval: 0.5)
        }
        return false
    }

    private func tcpPortOpen(port: UInt16) -> Bool {
        let sem  = DispatchSemaphore(value: 0)
        var open = false
        let conn = NWConnection(
            host: "127.0.0.1",
            port: NWEndpoint.Port(rawValue: port)!,
            using: .tcp)
        conn.stateUpdateHandler = { state in
            switch state {
            case .ready:
                open = true
                conn.cancel()
                sem.signal()
            case .failed, .cancelled:
                sem.signal()
            default: break
            }
        }
        conn.start(queue: .global())
        _ = sem.wait(timeout: .now() + 1.0)
        return open
    }

    // ---------------------------------------------------------------------------
    // Audio capture
    // ---------------------------------------------------------------------------

    private func startAudioEngine(retryCount: Int = 0) {
        guard isRunning else { return }

        // Guard against accessing inputNode (which can trigger a system mic dialog)
        // before the user has explicitly granted permission via requestPermissions.
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
            NSLog("[PBV] startAudioEngine: mic not authorized, skipping start")
            onStateChange?(.idle)
            return
        }

        // Remove before adding — startAudioEngine may be called multiple times
        // during retry, and we must not accumulate duplicate observers.
        NotificationCenter.default.removeObserver(
            self, name: .AVAudioEngineConfigurationChange, object: audioEngine)
        NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object:  audioEngine,
            queue:   .main
        ) { [weak self] _ in
            NSLog("[PBV] audio device changed — restarting engine")
            self?.restartAudioEngine()
        }

        // When preferBuiltInMic is set, pin the engine's input to the built-in
        // mic so AirPods stay in high-quality A2DP output mode. Clearing this
        // allows AirPods to be used as mic (better SNR) at the cost of switching
        // them to HFP/SCO, which degrades audio output for all apps.
        if preferBuiltInMic { pinInputToBuiltInMic() }

        let inputNode = audioEngine.inputNode

        guard !tapInstalled else {
            NSLog("[PBV] installTap skipped — tap already installed")
            return
        }
        // Pass nil so AVAudioEngine uses whatever the node's current format is at
        // call time. Passing a captured nativeFormat crashes when AirPods finish
        // initialising between the format read and the installTap call (the hardware
        // format changes and AVAudioEngine throws an uncatchable NSException).
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: nil) {
            [weak self] buffer, _ in
            guard let self, self.isRunning else { return }
            DispatchQueue.main.async { self.receive(buffer) }
        }
        tapInstalled = true

        do {
            try audioEngine.start()
            let fmt = inputNode.outputFormat(forBus: 0)
            NSLog("[PBV] audioEngine started — %.0f Hz, %u ch",
                  fmt.sampleRate, fmt.channelCount)
            onStateChange?(.listening)
            scheduleHealthCheck()
        } catch {
            let code = (error as NSError).code
            if code == -10868 {
                if tapInstalled {
                    audioEngine.inputNode.removeTap(onBus: 0)
                    tapInstalled = false
                }
                if retryCount < 5 {
                    let delay = 3.0 + Double(retryCount) * 2.0  // 3, 5, 7, 9, 11s
                    NSLog("[PBV] audioEngine -10868 — retry %d/5 in %.0fs", retryCount + 1, delay)
                    audioEngine.reset()
                    isRestarting = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                        self?.isRestarting = false
                        self?.startAudioEngine(retryCount: retryCount + 1)
                    }
                } else {
                    // reset() didn't help — recreate the engine entirely.
                    // A flood of config-change notifications can leave the engine in a
                    // permanently broken hardware-connection state that only a new
                    // AVAudioEngine() instance can escape.
                    NSLog("[PBV] audioEngine -10868 — recreating engine after 5 resets")
                    let staleEngine = audioEngine
                    NotificationCenter.default.removeObserver(
                        self, name: .AVAudioEngineConfigurationChange, object: staleEngine)
                    if staleEngine.isRunning { staleEngine.stop() }
                    audioEngine  = AVAudioEngine()
                    tapInstalled = false
                    isRestarting = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) { [weak self] in
                        self?.isRestarting = false
                        self?.startAudioEngine(retryCount: 0)  // fresh count with new engine
                    }
                }
            } else {
                NSLog("[PBV] audioEngine error: %@", error.localizedDescription)
                onStateChange?(.error(error.localizedDescription))
            }
        }
    }

    // Downmix to mono then resample to 16 kHz float32 for Whisper.
    private func toMono16k(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        let targetFmt = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                      sampleRate: 16_000, channels: 1,
                                      interleaved: false)!

        // --- Step 1: downmix to mono at native sample rate ---
        let monoFmt = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                    sampleRate: buffer.format.sampleRate,
                                    channels: 1, interleaved: false)!
        guard let mono = AVAudioPCMBuffer(pcmFormat: monoFmt,
                                          frameCapacity: buffer.frameLength) else { return nil }
        mono.frameLength = buffer.frameLength

        if let src = buffer.floatChannelData, let dst = mono.floatChannelData {
            let n  = Int(buffer.frameLength)
            let ch = Int(buffer.format.channelCount)
            // Convert to float first if needed, then average channels.
            if buffer.format.commonFormat == .pcmFormatFloat32 {
                let scale = 1.0 / Float(max(ch, 1))
                for i in 0..<n { dst[0][i] = 0 }
                for c in 0..<ch { for i in 0..<n { dst[0][i] += src[c][i] } }
                for i in 0..<n { dst[0][i] *= scale }
            } else {
                // Int16 → float path
                if let isrc = buffer.int16ChannelData {
                    let scale = 1.0 / Float(max(ch, 1)) / 32768.0
                    for i in 0..<n { dst[0][i] = 0 }
                    for c in 0..<ch { for i in 0..<n { dst[0][i] += Float(isrc[c][i]) } }
                    for i in 0..<n { dst[0][i] *= scale }
                }
            }
        }

        // --- Step 2: resample mono → 16 kHz ---
        guard let conv = AVAudioConverter(from: monoFmt, to: targetFmt) else {
            NSLog("[PBV] AVAudioConverter nil for %.0f→16000 Hz", monoFmt.sampleRate)
            return nil
        }
        let ratio       = targetFmt.sampleRate / monoFmt.sampleRate
        let outCapacity = AVAudioFrameCount(Double(mono.frameLength) * ratio) + 1
        guard let out   = AVAudioPCMBuffer(pcmFormat: targetFmt,
                                           frameCapacity: outCapacity) else { return nil }
        var done = false; var err: NSError?
        conv.convert(to: out, error: &err) { _, status in
            if done { status.pointee = .noDataNow }
            else { status.pointee = .haveData; done = true }
            return mono
        }
        return err == nil && out.frameLength > 0 ? out : nil
    }

    // ---------------------------------------------------------------------------
    // Input device selection
    // ---------------------------------------------------------------------------

    // Set the AVAudioEngine's underlying HAL input device to the built-in mic.
    // This prevents AirPods from switching to HFP/SCO mode (which degrades
    // their audio output quality) just because PBV needs a mic.
    // Falls back silently to system default if no built-in mic is found.
    private func pinInputToBuiltInMic() {
        var inputDeviceID = AudioDeviceID(kAudioObjectUnknown)

        // Find a device whose UID contains "BuiltIn" and has input channels.
        var propAddr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope:    kAudioObjectPropertyScopeGlobal,
            mElement:  kAudioObjectPropertyElementMain)
        var dataSize: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject),
                                             &propAddr, 0, nil, &dataSize) == noErr else { return }
        let deviceCount = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),
                                         &propAddr, 0, nil, &dataSize, &deviceIDs) == noErr else { return }

        for deviceID in deviceIDs {
            // Check for input channels.
            var inputAddr = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyStreamConfiguration,
                mScope:    kAudioDevicePropertyScopeInput,
                mElement:  kAudioObjectPropertyElementMain)
            var bufSize: UInt32 = 0
            guard AudioObjectGetPropertyDataSize(deviceID, &inputAddr, 0, nil, &bufSize) == noErr,
                  bufSize > 0 else { continue }

            // Check UID for "BuiltIn".
            var uidAddr = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceUID,
                mScope:    kAudioObjectPropertyScopeGlobal,
                mElement:  kAudioObjectPropertyElementMain)
            var uidRef: Unmanaged<CFString>? = nil
            var uidSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
            guard AudioObjectGetPropertyData(deviceID, &uidAddr, 0, nil, &uidSize, &uidRef) == noErr
            else { continue }
            let uid = uidRef?.takeRetainedValue() as String? ?? ""
            if uid.contains("BuiltIn") {
                inputDeviceID = deviceID
                break
            }
        }

        guard inputDeviceID != kAudioObjectUnknown else {
            NSLog("[PBV] pinInputToBuiltInMic: no built-in mic found, using default")
            return
        }

        // Set it on the engine's audio unit.
        let audioUnit = audioEngine.inputNode.audioUnit
        let err = AudioUnitSetProperty(
            audioUnit!,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &inputDeviceID,
            UInt32(MemoryLayout<AudioDeviceID>.size))
        if err == noErr {
            NSLog("[PBV] pinInputToBuiltInMic: pinned to device %u", inputDeviceID)
        } else {
            NSLog("[PBV] pinInputToBuiltInMic: AudioUnitSetProperty err=%d", err)
        }
    }

    // ---------------------------------------------------------------------------
    // Silence detection
    // ---------------------------------------------------------------------------

    private var speechDetected = false

    private func receive(_ buffer: AVAudioPCMBuffer) {
        frames.append(buffer)
        let rms = rmsBuffer(buffer)
        healthFrameCount += 1
        healthEnergySum  += rms

        if rms >= energyThreshold {
            // Speech detected — reset the post-speech silence timer.
            speechDetected = true
            silenceTimer?.cancel()
            let item = DispatchWorkItem { [weak self] in self?.flush() }
            silenceTimer = item
            DispatchQueue.main.asyncAfter(deadline: .now() + silenceDelay, execute: item)
        }
        // Low-energy buffer: if speechDetected, the running timer counts down.
        // If never detected speech yet, don't start a timer — wait for voice first.

        // Safety valve: flush after ~10 s even if energy stays below threshold,
        // so the buffer doesn't grow unbounded.
        let maxFrames = Int(48_000 * 10 / 4800) // ~10 s at 48 kHz / 4800 frames per buffer
        if frames.count >= maxFrames { flush() }
    }

    private func scheduleHealthCheck() {
        healthCheck?.cancel()
        healthFrameCount = 0
        healthEnergySum  = 0
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.isRunning, !self.isRestarting else { return }
            let avg = self.healthFrameCount > 0
                ? self.healthEnergySum / Float(self.healthFrameCount)
                : 0
            // A live mic always has background noise above ~0.00005.
            // Effectively-zero RMS means the tap is on a dead/wrong device.
            if avg < 0.00005 {
                NSLog("[PBV] healthCheck: avg RMS %.6f over %d frames — dead device, full restart",
                      avg, self.healthFrameCount)
                // Use stop()+start() rather than restartAudioEngine() to avoid
                // inheriting any existing retry state or isRestarting flag.
                self.stop()
                self.start()
            } else {
                NSLog("[PBV] healthCheck: avg RMS %.6f — device OK", avg)
            }
        }
        healthCheck = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: item)
    }

    private func flush() {
        silenceTimer = nil
        speechDetected = false
        guard isRunning, !frames.isEmpty else { return }
        let captured = frames
        frames.removeAll()
        let energy = rms(captured)
        NSLog("[PBV] flush: %d frames rms=%.4f", captured.count, energy)
        guard energy >= energyThreshold else { return }

        // Strip leading sub-threshold buffers before sending to Whisper.
        // Whisper pads input to 30 s with silence; leading silence in the audio
        // causes the decoder to start confused and mangle the first word.
        let trimmed = Array(captured.drop(while: { self.rmsBuffer($0) < self.energyThreshold }))
        NSLog("[PBV] flush: trimmed %d leading silence frames", captured.count - trimmed.count)

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            guard let result = self.transcribe(trimmed), !result.text.isEmpty else { return }
            NSLog("[PBV] transcript: %@ low_conf=%d", result.text, result.lowConfidence)
            DispatchQueue.main.async { self.onTranscript?(result.text, result.lowConfidence) }
        }
    }

    // Per-buffer RMS for the silence gate in receive().
    private func rmsBuffer(_ buffer: AVAudioPCMBuffer) -> Float {
        let n = Int(buffer.frameLength)
        guard n > 0 else { return 0 }
        var sum: Float = 0
        if let ch = buffer.floatChannelData?[0] {
            for i in 0..<n { sum += ch[i] * ch[i] }
        } else if let ch = buffer.int16ChannelData?[0] {
            for i in 0..<n { let s = Float(ch[i]) / 32768.0; sum += s * s }
        } else { return 1.0 }
        return sqrtf(sum / Float(n))
    }

    // RMS energy — works with float32 or int16 native formats.
    private func rms(_ buffers: [AVAudioPCMBuffer]) -> Float {
        var sum: Float = 0; var count: Int = 0
        for buf in buffers {
            let n = Int(buf.frameLength)
            if let ch = buf.floatChannelData?[0] {
                for i in 0..<n { sum += ch[i] * ch[i] }
            } else if let ch = buf.int16ChannelData?[0] {
                for i in 0..<n { let s = Float(ch[i]) / 32768.0; sum += s * s }
            } else {
                // Unknown format — assume non-silent so we still send to Whisper.
                return 1.0
            }
            count += n
        }
        return count > 0 ? sqrtf(sum / Float(count)) : 0
    }

    // ---------------------------------------------------------------------------
    // Whisper transcription via HTTP server
    // ---------------------------------------------------------------------------

    private struct WhisperResult {
        let text:          String
        let lowConfidence: Bool   // avg_logprob < -0.8 or fallback temperature used
    }

    private func transcribe(_ buffers: [AVAudioPCMBuffer]) -> WhisperResult? {
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("vc_\(arc4random()).wav")
        defer { try? FileManager.default.removeItem(at: tmpURL) }
        guard writeWAV(buffers, to: tmpURL),
              let wavData = try? Data(contentsOf: tmpURL) else { return nil }

        // Build multipart/form-data body.
        let boundary = "PBV\(arc4random())"
        var body = Data()
        func append(_ s: String) { body.append(Data(s.utf8)) }

        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n")
        append("Content-Type: audio/wav\r\n\r\n")
        body.append(wavData)
        append("\r\n--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"temperature\"\r\n\r\n0\r\n")
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n")
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"language\"\r\n\r\nen\r\n")
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"prompt\"\r\n\r\n")
        append(Self.whisperPrompt)
        append("\r\n--\(boundary)--\r\n")

        var req = URLRequest(url: serverURL, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)",
                     forHTTPHeaderField: "Content-Type")
        req.httpBody = body

        let sem  = DispatchSemaphore(value: 0)
        var result: WhisperResult?
        URLSession.shared.dataTask(with: req) { data, _, _ in
            defer { sem.signal() }
            guard let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let raw  = json["text"] as? String else {
                SpeechEngine.transcriptLog("(no response or parse error)")
                return
            }
            SpeechEngine.transcriptLog("raw:     \(raw.trimmingCharacters(in: .whitespacesAndNewlines))")

            // --- Segment-level confidence metrics ---
            let segs = json["segments"] as? [[String: Any]] ?? []
            let maxNoSpeechProb = segs.compactMap { $0["no_speech_prob"] as? Double }.max() ?? 0
            let minAvgLogProb   = segs.compactMap { $0["avg_logprob"]   as? Double }.min() ?? 0
            let anyFallbackTemp = segs.compactMap { $0["temperature"]   as? Double }.contains { $0 > 0 }
            SpeechEngine.transcriptLog(String(format: "conf:    no_speech=%.2f logprob=%.2f fallback_temp=%@",
                                              maxNoSpeechProb, minAvgLogProb, anyFallbackTemp ? "yes" : "no"))

            // Filter 1: no_speech_prob — silence/hallucination detector.
            // Whisper's own internal threshold is 0.6; we use 0.65 to be slightly
            // more permissive (prefer missing a filter over blocking real speech).
            if maxNoSpeechProb > 0.65 {
                SpeechEngine.transcriptLog(String(format: "filtered (no_speech=%.2f): %@",
                                                  maxNoSpeechProb,
                                                  raw.trimmingCharacters(in: .whitespacesAndNewlines)))
                return
            }

            let cleaned = raw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"<\|[^|]+\|>"#, with: "",
                                      options: .regularExpression)  // <|token|> style
                .replacingOccurrences(of: #"\[[A-Z_]+\]"#, with: "",
                                      options: .regularExpression)  // [BLANK_AUDIO], [MUSIC], etc.
                .trimmingCharacters(in: .whitespacesAndNewlines)

            // Filter 2: text-based hallucination list (covers zero-segment edge case).
            let lower = cleaned.lowercased()
            let hallucinations = ["you", "thank you", "thanks", ".", ""]
            if hallucinations.contains(lower) {
                SpeechEngine.transcriptLog("filtered (hallucination): \(cleaned)")
                return
            }

            // Low-confidence flag — passed to extension to gate destructive commands.
            // avg_logprob < -0.8: model was uncertain about the whole segment.
            // anyFallbackTemp: greedy decode failed; Whisper resampled at higher temp.
            let lowConfidence = minAvgLogProb < -0.8 || anyFallbackTemp
            SpeechEngine.transcriptLog(lowConfidence
                ? "sent [low_conf]: \(cleaned)"
                : "sent:    \(cleaned)")
            result = WhisperResult(text: cleaned, lowConfidence: lowConfidence)
        }.resume()
        sem.wait()
        return result
    }

    // ---------------------------------------------------------------------------
    // Transcript logging — writes to /tmp/pbv-transcripts.log
    // Watch live with: tail -f /tmp/pbv-transcripts.log
    // ---------------------------------------------------------------------------

    static func transcriptLog(_ message: String) {
        let ts      = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
        let escaped = message.replacingOccurrences(of: "\n", with: "\\n")
        let line    = "[\(ts)] \(escaped)\n"
        if let data = line.data(using: .utf8) {
            let url = URL(fileURLWithPath: "/tmp/pbv-transcripts.log")
            if let fh = try? FileHandle(forWritingTo: url) {
                fh.seekToEndOfFile()
                fh.write(data)
                fh.closeFile()
            } else {
                try? data.write(to: url, options: .atomic)
            }
        }
    }

    // ---------------------------------------------------------------------------
    // WAV writer
    // ---------------------------------------------------------------------------

    private func writeWAV(_ buffers: [AVAudioPCMBuffer], to url: URL) -> Bool {
        guard let first = buffers.first else { return false }
        // Explicit 16-bit PCM WAV settings — whisper-server reads this reliably.
        let settings: [String: Any] = [
            AVFormatIDKey:             kAudioFormatLinearPCM,
            AVSampleRateKey:           first.format.sampleRate,
            AVNumberOfChannelsKey:     first.format.channelCount,
            AVLinearPCMBitDepthKey:    16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey:     false,
            AVLinearPCMIsNonInterleaved: false,
        ]
        do {
            let file = try AVAudioFile(forWriting: url, settings: settings)
            for buf in buffers { try file.write(from: buf) }
            NSLog("[PBV] wrote WAV: %d frames, %.0f Hz, %u ch",
                  buffers.reduce(0) { $0 + Int($1.frameLength) },
                  first.format.sampleRate, first.format.channelCount)
            return true
        } catch {
            NSLog("[PBV] WAV write error: %@", error.localizedDescription)
            return false
        }
    }
}
