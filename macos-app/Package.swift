// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "VoiceCoder",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "VoiceCoder",
            path: "Sources/VoiceCoder",
            resources: [
                .process("Resources/compiled.json"),
            ]
        )
    ]
)
