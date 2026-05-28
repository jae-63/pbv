import AVFoundation
import Speech

final class SpeechEngine: NSObject {

    var onTranscript:  ((String) -> Void)?
    var onStateChange: ((State) -> Void)?

    enum State { case idle, listening, error(String) }

    private let recognizer  = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
    private let audioEngine = AVAudioEngine()
    private var recognitionReq:  SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var isRunning = false
    private var silenceTimer: DispatchWorkItem?
    private var lastPartial = ""
    private var sessionGeneration = 0

    // ---------------------------------------------------------------------------
    // Permissions
    // ---------------------------------------------------------------------------

    func requestPermissions(completion: @escaping (Bool) -> Void) {
        NSLog("[VoiceCoder] requestPermissions: asking speech auth")
        SFSpeechRecognizer.requestAuthorization { authStatus in
            NSLog("[VoiceCoder] requestPermissions: speech authStatus=%d", authStatus.rawValue)
            guard authStatus == .authorized else {
                DispatchQueue.main.async { completion(false) }
                return
            }
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                NSLog("[VoiceCoder] requestPermissions: mic granted=%d", granted ? 1 : 0)
                DispatchQueue.main.async { completion(granted) }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Start / stop
    // ---------------------------------------------------------------------------

    func start() {
        guard !isRunning else { return }
        isRunning = true
        startAudioEngine()
    }

    func stop() {
        isRunning = false
        silenceTimer?.cancel()
        silenceTimer = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionReq?.endAudio()
        recognitionReq = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        onStateChange?(.idle)
    }

    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------

    // Called once — starts the audio engine and installs the tap permanently.
    private func startAudioEngine() {
        guard isRunning else { return }

        let inputNode = audioEngine.inputNode
        let format    = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionReq?.append(buffer)
        }

        do {
            try audioEngine.start()
            NSLog("[VoiceCoder] audioEngine started")
            onStateChange?(.listening)
        } catch {
            NSLog("[VoiceCoder] audioEngine.start() threw: %@", error.localizedDescription)
            onStateChange?(.error(error.localizedDescription))
            return
        }

        startRecognitionSession()
    }

    // Opens a new recognition session on the already-running audio engine.
    // The engine tap keeps feeding buffers; we just swap the request object.
    private func startRecognitionSession() {
        guard isRunning else { return }

        // Cancel any in-flight session first (fires callback with "canceled" — ignored below).
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionReq?.endAudio()

        lastPartial = ""
        silenceTimer?.cancel()
        silenceTimer = nil

        sessionGeneration += 1
        let myGen = sessionGeneration

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionReq = request

        NSLog("[VoiceCoder] startRecognitionSession gen=%d", myGen)

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self, self.sessionGeneration == myGen else { return }

            if let error {
                let msg = error.localizedDescription
                NSLog("[VoiceCoder] recognition error: %@", msg)
                // "canceled" fires when we call .cancel() ourselves — ignore.
                // Any other error (e.g. session expired) → restart session after a delay.
                if !msg.lowercased().contains("cancel") {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
                        self?.startRecognitionSession()
                    }
                }
                return
            }

            guard let result else { return }
            let text = result.bestTranscription.formattedString
            guard !text.isEmpty else { return }

            NSLog("[VoiceCoder] partial: %@", text)
            self.lastPartial = text

            if result.isFinal {
                // endAudio() triggered this — dispatch the transcript, open next session.
                NSLog("[VoiceCoder] transcript (final): %@", text)
                self.silenceTimer?.cancel()
                self.silenceTimer = nil
                self.lastPartial  = ""
                DispatchQueue.main.async { self.onTranscript?(text) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self.startRecognitionSession()
                }
                return
            }

            // Not final — reset the silence timer.
            self.silenceTimer?.cancel()
            let item = DispatchWorkItem { [weak self] in
                guard let self else { return }
                let captured      = self.lastPartial
                self.lastPartial  = ""
                self.silenceTimer = nil
                if !captured.isEmpty {
                    NSLog("[VoiceCoder] transcript (silence): %@", captured)
                    DispatchQueue.main.async { self.onTranscript?(captured) }
                }
                // Signal end-of-audio; isFinal will fire and open the next session.
                self.recognitionReq?.endAudio()
            }
            self.silenceTimer = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7, execute: item)
        }
    }
}
