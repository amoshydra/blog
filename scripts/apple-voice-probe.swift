// Resolves Apple speech voices for Chinese and Cantonese tags.
//
// macOS:
//   xcrun swiftc scripts/apple-voice-probe.swift -o /tmp/apple-voice-probe \
//     -framework AVFoundation && /tmp/apple-voice-probe
//
// iOS simulator (pick an available UDID from `xcrun simctl list devices`):
//   xcrun --sdk iphonesimulator swiftc \
//     -target arm64-apple-ios18.0-simulator \
//     scripts/apple-voice-probe.swift -o /tmp/ios-voice-probe \
//     -framework AVFoundation
//   xcrun simctl spawn <udid> /tmp/ios-voice-probe
//
// Prints the resolved voice for each tag, then every installed zh/yue voice.
// It makes no sound and changes no settings.

import Foundation
import AVFoundation

let tags = [
    "yue", "yue-Hant-HK", "yue-Hans-CN", "yue-CN", "yue-Hans-HK",
    "zh", "zh-Hant", "zh-Hans", "zh-HK", "zh-Hant-HK", "zh-Hans-HK",
    "zh-MO", "zh-Hant-MO", "zh-Hans-MO",
    "zh-TW", "zh-Hant-TW", "zh-Hans-TW",
    "zh-CN", "zh-Hant-CN", "zh-SG", "zh-Hans-SG",
    "zh-Hant-SG", "zh-Hant-MY", "zh-Hant-AU", "zh-Hant-GB", "zh-Hant-US",
    "zh-Hant-CA", "zh-Hant-PH", "zh-Hant-TH", "zh-Hant-VN", "zh-Hant-ID",
    "zh-Hant-001", "zh-Hans-MY", "zh-MY",
]

print("== os")
print(ProcessInfo.processInfo.operatingSystemVersionString)
print("== preferredLanguages")
print(Locale.preferredLanguages)

print("== maximalIdentifier")
for tag in ["zh-HK", "zh-Hant-HK", "yue", "yue-Hant-HK", "zh-Hant", "zh-Hans-HK"] {
    print("\(tag) -> \(Locale.Language(identifier: tag).maximalIdentifier)")
}

print("== installed zh/yue voices")
for v in AVSpeechSynthesisVoice.speechVoices() {
    let language = v.language.lowercased()
    if language.hasPrefix("zh") || language.hasPrefix("yue") {
        print("\(v.identifier) | \(v.name) | \(v.language)")
    }
}

print("== resolve by language tag")
for tag in tags {
    if let v = AVSpeechSynthesisVoice(language: tag) {
        print("\(tag) -> \(v.name) | \(v.language) | \(v.identifier)")
    } else {
        print("\(tag) -> nil")
    }
}
