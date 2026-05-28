import AVFoundation
import Foundation

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
    private var serverURL:  URL { URL(string: "http://127.0.0.1:\(serverPort)/inference")! }

    // RMS below this level is treated as silence and not sent to Whisper.
    private let energyThreshold: Float = 0.01

    // Silence timeout — wait this long after last audio before transcribing.
    private let silenceDelay: TimeInterval = 0.8

    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------

    private let audioEngine  = AVAudioEngine()
    private var frames       = [AVAudioPCMBuffer]()
    private var silenceTimer: DispatchWorkItem?
    private var isRunning    = false
    private var converter:    AVAudioConverter?

    // ---------------------------------------------------------------------------
    // Permissions — only mic needed now (no SFSpeechRecognizer)
    // ---------------------------------------------------------------------------

    func requestPermissions(completion: @escaping (Bool) -> Void) {
        NSLog("[VoiceCoder] requestPermissions: asking mic auth")
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            NSLog("[VoiceCoder] requestPermissions: mic granted=%d", granted ? 1 : 0)
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
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        onStateChange?(.idle)
    }

    // Returns true when whisper-server responds to a GET /.
    private func waitForServer(attempts: Int = 60) -> Bool {
        let healthURL = URL(string: "http://127.0.0.1:\(serverPort)/")!
        for _ in 0..<attempts {
            var req = URLRequest(url: healthURL, timeoutInterval: 1.0)
            req.httpMethod = "GET"
            let sem = DispatchSemaphore(value: 0)
            var responded = false
            URLSession.shared.dataTask(with: req) { _, resp, _ in
                responded = (resp as? HTTPURLResponse) != nil
                sem.signal()
            }.resume()
            _ = sem.wait(timeout: .now() + 1.5)
            if responded { return true }
            Thread.sleep(forTimeInterval: 0.5)
        }
        return false
    }

    // ---------------------------------------------------------------------------
    // Audio capture
    // ---------------------------------------------------------------------------

    private func startAudioEngine() {
        guard isRunning else { return }

        let inputNode    = audioEngine.inputNode
        let nativeFormat = inputNode.outputFormat(forBus: 0)
        let whisperFmt   = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                         sampleRate: 16_000, channels: 1,
                                         interleaved: false)!
        converter = AVAudioConverter(from: nativeFormat, to: whisperFmt)

        inputNode.installTap(onBus: 0, bufferSize: 4096, format: nativeFormat) {
            [weak self] buffer, _ in
            guard let self, self.isRunning else { return }
            if let buf = self.resample(buffer, to: whisperFmt) {
                DispatchQueue.main.async { self.receive(buf) }
            }
        }

        do {
            try audioEngine.start()
            NSLog("[VoiceCoder] audioEngine started (Whisper/server backend)")
            onStateChange?(.listening)
        } catch {
            NSLog("[VoiceCoder] audioEngine error: %@", error.localizedDescription)
            onStateChange?(.error(error.localizedDescription))
        }
    }

    private func resample(_ buffer: AVAudioPCMBuffer,
                          to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        guard let conv = converter else { return nil }
        let ratio       = format.sampleRate / buffer.format.sampleRate
        let outCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
        guard let out   = AVAudioPCMBuffer(pcmFormat: format,
                                           frameCapacity: outCapacity) else { return nil }
        var inputDone = false
        var error: NSError?
        conv.convert(to: out, error: &error) { _, status in
            if inputDone { status.pointee = .noDataNow } else {
                status.pointee = .haveData; inputDone = true
            }
            return buffer
        }
        return error == nil ? out : nil
    }

    // ---------------------------------------------------------------------------
    // Silence detection
    // ---------------------------------------------------------------------------

    private func receive(_ buffer: AVAudioPCMBuffer) {
        frames.append(buffer)
        silenceTimer?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.flush() }
        silenceTimer = item
        DispatchQueue.main.asyncAfter(deadline: .now() + silenceDelay, execute: item)
    }

    private func flush() {
        guard isRunning, !frames.isEmpty else { return }
        let captured = frames
        frames.removeAll()

        // Skip if audio is too quiet (mic noise / silence).
        guard rms(captured) >= energyThreshold else { return }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            guard let text = self.transcribe(captured), !text.isEmpty else { return }
            NSLog("[VoiceCoder] transcript: %@", text)
            DispatchQueue.main.async { self.onTranscript?(text) }
        }
    }

    // RMS energy across all captured frames.
    private func rms(_ buffers: [AVAudioPCMBuffer]) -> Float {
        var sum: Float = 0; var count: Int = 0
        for buf in buffers {
            guard let ch = buf.floatChannelData?[0] else { continue }
            let n = Int(buf.frameLength)
            for i in 0..<n { sum += ch[i] * ch[i] }
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
        let boundary = "VoiceCoder\(arc4random())"
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
        append("--\(boundary)--\r\n")

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
        do {
            let file = try AVAudioFile(forWriting: url,
                                       settings: first.format.settings,
                                       commonFormat: .pcmFormatFloat32,
                                       interleaved: false)
            for buf in buffers { try file.write(from: buf) }
            return true
        } catch {
            NSLog("[VoiceCoder] WAV write error: %@", error.localizedDescription)
            return false
        }
    }
}
