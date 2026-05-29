import Foundation

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

struct VocabEntry {
    let spoken:      String
    let written:     String?
    let action:      String?
    let param:       VocabParam?
    let spaceBefore: Bool
    let spaceAfter:  Bool
    let source:      String   // core / python / go / terraform / k8s-yaml
    let category:    String
}

enum VocabParam {
    case single(String)
    case multi([String])
}

enum ParsedCommand {
    case action(name: String, params: [String: Any])
    case insertText(String)                          // pre-assembled, ready to send
    case noMatch
}

// ---------------------------------------------------------------------------
// CommandParser
// ---------------------------------------------------------------------------

final class CommandParser {

    // Entries whose spoken form is a fixed string → fast lookup.
    private var exactLookup: [String: VocabEntry] = [:]

    // Entries with {PARAM} placeholders → regex + ordered param names.
    private struct ParamPattern {
        let regex:      NSRegularExpression
        let paramNames: [String]
        let entry:      VocabEntry
    }
    private var paramPatterns: [ParamPattern] = []

    // spoken → written, for dictation-mode substitution.
    private var dictationSubst: [String: String] = [:]

    // ---------------------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------------------

    init(compiledJSONURL: URL) throws {
        let raw  = try Data(contentsOf: compiledJSONURL)
        let json = try JSONSerialization.jsonObject(with: raw) as! [String: Any]
        let rawEntries = json["entries"] as! [[String: Any]]

        for r in rawEntries {
            guard let spoken = r["spoken"] as? String else { continue }

            let param: VocabParam?
            if let p = r["param"] as? String        { param = .single(p) }
            else if let ps = r["param"] as? [String] { param = .multi(ps) }
            else                                     { param = nil }

            let entry = VocabEntry(
                spoken:      spoken,
                written:     r["written"]     as? String,
                action:      r["action"]      as? String,
                param:       param,
                spaceBefore: r["spaceBefore"] as? Bool ?? true,
                spaceAfter:  r["spaceAfter"]  as? Bool ?? true,
                source:      r["source"]      as? String ?? "",
                category:    r["category"]    as? String ?? ""
            )

            if spoken.contains("{") {
                registerPattern(entry)
            } else {
                exactLookup[spoken.lowercased()] = entry
                if let written = entry.written {
                    dictationSubst[spoken.lowercased()] = written
                }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Command-mode parse: whole utterance → single command
    // ---------------------------------------------------------------------------

    func parseCommand(_ transcript: String) -> ParsedCommand {
        var t = transcript.trimmingCharacters(in: .whitespaces).lowercased()
        while let last = t.last, ".,!?".contains(last) { t.removeLast() }

        if let entry = exactLookup[t] { return resolve(entry, captures: [:]) }

        let nsT   = t as NSString
        let range = NSRange(location: 0, length: nsT.length)
        for pp in paramPatterns {
            guard let m = pp.regex.firstMatch(in: t, range: range) else { continue }
            var captures: [String: Any] = [:]
            for (i, name) in pp.paramNames.enumerated() {
                let captureRange = m.range(at: i + 1)
                if captureRange.location != NSNotFound,
                   let r = Range(captureRange, in: t) {
                    captures[name] = parseParamValue(name: name, raw: String(t[r]))
                }
            }
            return resolve(pp.entry, captures: captures)
        }
        return .noMatch
    }

    // ---------------------------------------------------------------------------
    // Dictation-mode assembly: translate vocab substitutions, pass the rest through.
    // Called when an utterance does NOT match a cached command in dictation mode.
    // ---------------------------------------------------------------------------

    func assembleDictationText(_ transcript: String) -> String {
        let words = transcript.lowercased().components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        var out = ""
        var i   = 0
        while i < words.count {
            var matched = false
            // Greedy: try longest prefix first (up to 5 words)
            for len in stride(from: min(5, words.count - i), through: 1, by: -1) {
                let phrase = words[i ..< i + len].joined(separator: " ")
                if let written = dictationSubst[phrase] {
                    out    += written
                    i      += len
                    matched = true
                    break
                }
            }
            if !matched {
                if !out.isEmpty && !out.hasSuffix(" ") && !out.hasSuffix("\n") { out += " " }
                out += words[i]
                i   += 1
            }
        }
        return out
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private func resolve(_ entry: VocabEntry, captures: [String: Any]) -> ParsedCommand {
        if let action = entry.action  { return .action(name: action, params: captures) }
        if let written = entry.written { return .insertText(written) }
        return .noMatch
    }

    private func registerPattern(_ entry: VocabEntry) {
        // Escape the literal parts, replace {PARAM} with (.+?)
        var paramNames: [String] = []
        var regexStr = ""
        var remaining = entry.spoken

        // Simple scan: split on { } markers in order
        while let openBrace = remaining.firstIndex(of: "{"),
              let closeBrace = remaining[remaining.index(after: openBrace)...].firstIndex(of: "}") {
            // Append escaped literal prefix
            let prefix = String(remaining[remaining.startIndex ..< openBrace])
            regexStr  += NSRegularExpression.escapedPattern(for: prefix)
            regexStr  += "(.+?)"

            let nameRange  = remaining.index(after: openBrace) ..< closeBrace
            paramNames.append(String(remaining[nameRange]))

            remaining = String(remaining[remaining.index(after: closeBrace)...])
        }
        regexStr += NSRegularExpression.escapedPattern(for: remaining)

        guard let regex = try? NSRegularExpression(
            pattern: "^" + regexStr + "$",
            options: .caseInsensitive
        ) else { return }

        paramPatterns.append(ParamPattern(regex: regex, paramNames: paramNames, entry: entry))
    }

    private func parseParamValue(name: String, raw: String) -> Any {
        switch name {
        case "N", "W", "L": return parseNumber(raw) ?? 1
        case "ORD":          return parseOrdinal(raw) ?? 1
        default:             return raw   // TOKEN — pass through as string
        }
    }

    private func parseNumber(_ s: String) -> Int? {
        if let n = Int(s) { return n }
        return wordToNumber[s]
    }

    private func parseOrdinal(_ s: String) -> Int? { ordinalToNumber[s] }
}

// ---------------------------------------------------------------------------
// Word → integer tables (covers 0–99)
// ---------------------------------------------------------------------------

private let wordToNumber: [String: Int] = {
    var d: [String: Int] = [
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4,
        "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
        "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
        "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
        "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
        "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    ]
    let tens = ["twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"]
    let tensVal = [20,30,40,50,60,70,80,90]
    let ones = ["one","two","three","four","five","six","seven","eight","nine"]
    for (ti, ten) in tens.enumerated() {
        for (oi, one) in ones.enumerated() {
            d["\(ten) \(one)"] = tensVal[ti] + oi + 1
        }
    }
    return d
}()

private let ordinalToNumber: [String: Int] = [
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15,
    "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19, "twentieth": 20,
]
