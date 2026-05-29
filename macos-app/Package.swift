// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PBV",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "PBV",
            path: "Sources/PBV",
            resources: [
                .process("Resources/compiled.json"),
            ],
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "/Users/jonathanepstein/personal/programming-by-voice-2026/macos-app/Info.plist",
                ])
            ]
        )
    ]
)
