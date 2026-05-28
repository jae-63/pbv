import Foundation
import Network

// Connects to the VSCode extension's TCP IPC server.
// Sends newline-delimited JSON. Reconnects automatically on disconnect.

final class ExtensionClient {

    var onCacheUpdate: (([String]) -> Void)?

    private let host: NWEndpoint.Host
    private let port: NWEndpoint.Port
    private var connection: NWConnection?
    private var receiveBuffer = Data()
    private var reconnectWorkItem: DispatchWorkItem?

    init(host: String = "127.0.0.1", port: UInt16 = 7890) {
        self.host = NWEndpoint.Host(host)
        self.port = NWEndpoint.Port(rawValue: port)!
        connect()
    }

    // ---------------------------------------------------------------------------
    // Send a command
    // ---------------------------------------------------------------------------

    func send(_ payload: [String: Any]) {
        guard let conn = connection,
              conn.state == .ready,
              let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        var line = data
        line.append(0x0A) // newline
        conn.send(content: line, completion: .contentProcessed({ _ in }))
    }

    // Convenience typed senders

    func sendAction(_ name: String, params: [String: Any] = [:]) {
        var msg: [String: Any] = ["cmd": name]
        msg.merge(params) { _, new in new }
        send(msg)
    }

    func sendInsertText(_ text: String) {
        send(["cmd": "insertText", "text": text])
    }

    func sendTranscript(_ text: String) {
        send(["cmd": "transcript", "text": text])
    }

    func sendSetMode(_ mode: String) {
        send(["cmd": "setMode", "mode": mode])
    }

    // ---------------------------------------------------------------------------
    // Private — connection lifecycle
    // ---------------------------------------------------------------------------

    private func connect() {
        let conn = NWConnection(host: host, port: port, using: .tcp)
        connection = conn

        conn.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.startReceiving()
            case .failed, .cancelled:
                self?.scheduleReconnect()
            default:
                break
            }
        }
        conn.start(queue: .main)
    }

    private func startReceiving() {
        receive()
    }

    private func receive() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data {
                self.receiveBuffer.append(data)
                self.processBuffer()
            }
            if !isComplete && error == nil {
                self.receive()
            }
        }
    }

    private func processBuffer() {
        while let newline = receiveBuffer.firstIndex(of: 0x0A) {
            let lineData = receiveBuffer[receiveBuffer.startIndex ..< newline]
            receiveBuffer.removeSubrange(receiveBuffer.startIndex ... newline)
            handleMessage(lineData)
        }
    }

    private func handleMessage(_ data: Data) {
        guard let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let event = msg["event"] as? String, event == "cacheUpdate",
           let items = msg["items"] as? [String] {
            DispatchQueue.main.async { self.onCacheUpdate?(items) }
        }
    }

    private func scheduleReconnect() {
        reconnectWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.connect() }
        reconnectWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0, execute: item)
    }
}
