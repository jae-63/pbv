import AVFoundation
import Foundation
import Network

// Whisper-backed speech engine.
//
// On start(), launches whisper-server as a background process (model stays
// resident — no per-utterance load cost). AVAudioEngine captures 16 kHz mono
// PCM; an energy threshold gates silence; on the silence timer the buffered
// frames are POSTed to whisper-server and the transcript is returned.

final class SpeechEngine: NSObject {

    var onTranscript:  ((String) -> Void)?
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
        "Go to line 75. Line 32. Cursor up 5. Cursor down 3. Page up. Page down. " +
        "Delete word. Delete line. Delete 3 words. Delete to end. " +
        "Set mark. Undo transaction. Undo. Redo. Save. Format document. " +
        "Comment line. Select all. Copy. Cut. Paste. " +
        "Word 3 on line 68. Go to top. Go to bottom. End of line. Home. " +
        "Scroll down. Scroll up. Scroll left. Scroll right. " +
        "Traverse definitions. Stop scrolling. Faster. Slower."
    private var serverURL:  URL { URL(string: "http://127.0.0.1:\(serverPort)/inference")! }

    // RMS below this level is treated as silence and not sent to Whisper.
    private let energyThreshold: Float = 0.002

    // Silence timeout — wait this long after last audio before transcribing.
    private let silenceDelay: TimeInterval = 0.8

    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------

    private let audioEngine  = AVAudioEngine()
    private var frames       = [AVAudioPCMBuffer]()
    private var silenceTimer: DispatchWorkItem?
    private var isRunning    = false
    private var isRestarting = false
    private var tapInstalled = false

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
        NotificationCenter.default.removeObserver(
            self, name: .AVAudioEngineConfigurationChange, object: audioEngine)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        // Brief pause so macOS finishes reconfiguring the device.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
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

    private func startAudioEngine() {
        guard isRunning else { return }

        // Guard against accessing inputNode (which can trigger a system mic dialog)
        // before the user has explicitly granted permission via requestPermissions.
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
            NSLog("[PBV] startAudioEngine: mic not authorized, skipping start")
            onStateChange?(.idle)
            return
        }

        // Listen for device changes (AirPods connect/disconnect, USB mic plug/unplug).
        // When the engine reconfigures, tear down and restart cleanly.
        NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object:  audioEngine,
            queue:   .main
        ) { [weak self] _ in
            NSLog("[PBV] audio device changed — restarting engine")
            self?.restartAudioEngine()
        }

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
        } catch {
            NSLog("[PBV] audioEngine error: %@", error.localizedDescription)
            onStateChange?(.error(error.localizedDescription))
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
    // Silence detection
    // ---------------------------------------------------------------------------

    private var speechDetected = false

    private func receive(_ buffer: AVAudioPCMBuffer) {
        frames.append(buffer)

        if rmsBuffer(buffer) >= energyThreshold {
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

    private func flush() {
        silenceTimer = nil
        speechDetected = false
        guard isRunning, !frames.isEmpty else { return }
        let captured = frames
        frames.removeAll()
        let energy = rms(captured)
        NSLog("[PBV] flush: %d frames rms=%.4f", captured.count, energy)
        guard energy >= energyThreshold else { return }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            guard let text = self.transcribe(captured), !text.isEmpty else { return }
            NSLog("[PBV] transcript: %@", text)
            DispatchQueue.main.async { self.onTranscript?(text) }
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

    private func transcribe(_ buffers: [AVAudioPCMBuffer]) -> String? {
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
        var text: String?
        URLSession.shared.dataTask(with: req) { data, _, _ in
            defer { sem.signal() }
            guard let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let raw  = json["text"] as? String else { return }
            let cleaned = raw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"<\|[^|]+\|>"#, with: "",
                                      options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            // Filter common Whisper hallucinations on near-silence.
            let lower = cleaned.lowercased()
            let hallucinations = ["you", "thank you", "thanks", ".", ""]
            if hallucinations.contains(lower) { return }
            text = cleaned
        }.resume()
        sem.wait()
        return text
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
