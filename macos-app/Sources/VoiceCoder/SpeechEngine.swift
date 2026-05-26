import AVFoundation
import Speech

final class SpeechEngine: NSObject {

    var onTranscript:   ((String) -> Void)?
    var onStateChange:  ((State) -> Void)?

    enum State { case idle, listening, error(String) }

    private let recognizer     = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
    private let audioEngine    = AVAudioEngine()
    private var recognitionReq:  SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var isRunning        = false

    // ---------------------------------------------------------------------------
    // Permissions
    // ---------------------------------------------------------------------------

    func requestPermissions(completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { authStatus in
            guard authStatus == .authorized else {
                DispatchQueue.main.async { completion(false) }
                return
            }
            AVCaptureDevice.requestAccess(for: .audio) { granted in
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
        beginRecognition()
    }

    func stop() {
        isRunning = false
        tearDown()
        onStateChange?(.idle)
    }

    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------

    private func beginRecognition() {
        guard isRunning else { return }

        tearDown()

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true   // privacy; no cloud upload
        request.shouldReportPartialResults  = false  // fire only on utterance end

        recognitionReq = request

        let inputNode = audioEngine.inputNode
        let format    = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionReq?.append(buffer)
        }

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }

            if let result, result.isFinal {
                let text = result.bestTranscription.formattedString
                if !text.isEmpty {
                    DispatchQueue.main.async { self.onTranscript?(text) }
                }
            }

            // Recognition session ended (silence timeout or error) — restart immediately.
            if error != nil || result?.isFinal == true {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self.beginRecognition()
                }
            }
        }

        do {
            try audioEngine.start()
            onStateChange?(.listening)
        } catch {
            onStateChange?(.error(error.localizedDescription))
        }
    }

    private func tearDown() {
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionReq?.endAudio()
        recognitionReq = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
    }
}
