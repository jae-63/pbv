import AVFoundation
import Foundation

// Whisper-backed speech engine.
//
// AVAudioEngine captures mic audio into a ring of PCM frames. When the
// silence timer fires, the accumulated frames are written to a temp WAV file
// and whisper-cli is invoked. The resulting transcript is passed to the
// onTranscript callback, then the buffer is cleared and listening resumes.

final class SpeechEngine: NSObject {

    var onTranscript:  ((String) -> Void)?
    var onStateChange: ((State) -> Void)?

    enum State { case idle, listening, error(String) }

    private let audioEngine  = AVAudioEngine()
    private var frames       = [AVAudioPCMBuffer]()
    private var silenceTimer: DispatchWorkItem?
    private var isRunning    = false

    // Locate whisper-cli and the model once at init time.
    private let whisperCLI:  String
    private let modelPath:   String

    override init() {
        // whisper-cli is installed by Homebrew at a fixed path.
        whisperCLI = "/opt/homebrew/bin/whisper-cli"

        // Model lives where whisper-cpp-download-ggml-model puts it.
        let candidates = [
            "/opt/homebrew/share/whisper-cpp/models/ggml-small.en.bin",
            (NSHomeDirectory() as NSString).appendingPathComponent(
                "Library/Caches/whisper/ggml-small.en.bin"),
        ]
        modelPath = candidates.first { FileManager.default.fileExists(atPath: $0) } ?? candidates[0]
        super.init()
    }

    // ---------------------------------------------------------------------------
    // Permissions
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
        guard FileManager.default.fileExists(atPath: modelPath) else {
            onStateChange?(.error("Whisper model not found at \(modelPath)"))
            return
        }
        isRunning = true
        startAudioEngine()
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

    // ---------------------------------------------------------------------------
    // Private — audio capture
    // ---------------------------------------------------------------------------

    private func startAudioEngine() {
        let inputNode = audioEngine.inputNode
        // Whisper wants 16 kHz mono. Request that directly from the tap.
        let whisperFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                         sampleRate: 16000,
                                         channels: 1,
                                         interleaved: false)!
        let nativeFormat  = inputNode.outputFormat(forBus: 0)

        // AVAudioEngine will SRC from nativeFormat → whisperFormat automatically
        // when the tap format differs from the bus format.
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: nativeFormat) {
            [weak self] buffer, _ in
            guard let self, self.isRunning else { return }

            // Convert to 16 kHz mono in-place using AVAudioConverter.
            if let converted = self.convert(buffer, to: whisperFormat) {
                DispatchQueue.main.async { self.received(converted) }
            }
        }

        do {
            try audioEngine.start()
            NSLog("[VoiceCoder] audioEngine started (Whisper backend)")
            onStateChange?(.listening)
        } catch {
            NSLog("[VoiceCoder] audioEngine.start() threw: %@", error.localizedDescription)
            onStateChange?(.error(error.localizedDescription))
        }
    }

    // AVAudioConverter wrapper — reuse a converter per unique format pair.
    private var converter: AVAudioConverter?
    private var converterOutputFormat: AVAudioFormat?

    private func convert(_ buffer: AVAudioPCMBuffer, to outFormat: AVAudioFormat) -> AVAudioPCMBuffer? {
        if converter == nil || converterOutputFormat != outFormat {
            converter = AVAudioConverter(from: buffer.format, to: outFormat)
            converterOutputFormat = outFormat
        }
        guard let conv = converter else { return nil }

        let ratio       = outFormat.sampleRate / buffer.format.sampleRate
        let outCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
        guard let out   = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: outCapacity) else { return nil }

        var error: NSError?
        var inputDone = false
        conv.convert(to: out, error: &error) { _, outStatus in
            if inputDone {
                outStatus.pointee = .noDataNow
            } else {
                outStatus.pointee = .haveData
                inputDone = true
            }
            return buffer
        }
        return error == nil ? out : nil
    }

    // ---------------------------------------------------------------------------
    // Private — silence detection
    // ---------------------------------------------------------------------------

    private func received(_ buffer: AVAudioPCMBuffer) {
        frames.append(buffer)
        resetSilenceTimer()
    }

    private func resetSilenceTimer() {
        silenceTimer?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.flushToWhisper()
        }
        silenceTimer = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: item)
    }

    // ---------------------------------------------------------------------------
    // Private — Whisper transcription
    // ---------------------------------------------------------------------------

    private func flushToWhisper() {
        guard isRunning, !frames.isEmpty else { return }
        let captured = frames
        frames.removeAll()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            guard let transcript = self.runWhisper(on: captured), !transcript.isEmpty else { return }
            NSLog("[VoiceCoder] transcript: %@", transcript)
            DispatchQueue.main.async { self.onTranscript?(transcript) }
        }
    }

    private func runWhisper(on buffers: [AVAudioPCMBuffer]) -> String? {
        // Write PCM frames to a temp WAV file.
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("voicecoder_\(arc4random()).wav")
        defer { try? FileManager.default.removeItem(at: tmpURL) }

        guard writeWAV(buffers: buffers, to: tmpURL) else {
            NSLog("[VoiceCoder] failed to write WAV")
            return nil
        }

        // Run whisper-cli.
        let proc   = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        proc.executableURL = URL(fileURLWithPath: whisperCLI)
        proc.arguments     = [
            "--model",    modelPath,
            "--file",     tmpURL.path,
            "--language", "en",
            "--no-timestamps",
            "--output-txt",
            "--print-special", "false",
        ]
        proc.standardOutput = stdout
        proc.standardError  = stderr

        do {
            try proc.run()
            proc.waitUntilExit()
        } catch {
            NSLog("[VoiceCoder] whisper-cli launch failed: %@", error.localizedDescription)
            return nil
        }

        if proc.terminationStatus != 0 {
            let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            NSLog("[VoiceCoder] whisper-cli error: %@", err)
            return nil
        }

        let raw = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return cleanWhisperOutput(raw)
    }

    // Strip leading/trailing whitespace, [BLANK_AUDIO], and timestamp tokens.
    private func cleanWhisperOutput(_ raw: String) -> String {
        raw.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && $0 != "[BLANK_AUDIO]" && !$0.hasPrefix("[") }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
    }

    // ---------------------------------------------------------------------------
    // Private — WAV writer
    // ---------------------------------------------------------------------------

    private func writeWAV(buffers: [AVAudioPCMBuffer], to url: URL) -> Bool {
        guard let first = buffers.first else { return false }
        do {
            let file = try AVAudioFile(forWriting: url,
                                       settings: first.format.settings,
                                       commonFormat: .pcmFormatFloat32,
                                       interleaved: false)
            for buf in buffers { try file.write(from: buf) }
            return true
        } catch {
            NSLog("[VoiceCoder] AVAudioFile write error: %@", error.localizedDescription)
            return false
        }
    }
}
