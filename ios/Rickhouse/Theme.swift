import CoreText
import SwiftUI

/// The design language's paper, ink and type (docs/superpowers/specs/2026-10-05-design-language-design.md).
/// Light only for now: dark mode is designed alongside it, not derived, and isn't drawn yet.
enum Theme {
    static let paper = Color(hex: 0xF6F1E7)
    static let ink = Color(hex: 0x14213D)
    /// Secondary text. About 5.2:1 on paper.
    static let muted = Color(hex: 0x5B6478)
    /// Error text. About 5.8:1 on paper; system red is about 3.2:1.
    static let error = Color(hex: 0xB3261E)
}

/// An error message: the icon keeps colour from being the only cue.
struct ErrorText: View {
    let message: String

    init(_ message: String) { self.message = message }

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.inter(14, relativeTo: .footnote))
            .foregroundStyle(Theme.error)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// Inter and Source Serif 4, bundled unmodified under the SIL Open Font License
/// (the licence texts sit beside the fonts). Registered at launch, so no Info.plist entry is needed.
enum Fonts {
    static func register() {
        for file in ["Inter-Regular", "Inter-Medium", "Inter-SemiBold", "SourceSerif4Display-Semibold"] {
            guard let url = Bundle.main.url(forResource: file, withExtension: "ttf") else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

enum InterWeight {
    case regular, medium, semibold

    fileprivate var postScriptName: String {
        switch self {
        case .regular: "Inter-Regular"
        case .medium: "Inter-Medium"
        case .semibold: "Inter-SemiBold"
        }
    }
}

extension Font {
    /// Inter, scaling with the user's text size.
    static func inter(_ size: CGFloat, _ weight: InterWeight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(weight.postScriptName, size: size, relativeTo: style)
    }

    /// The serif is for headlines only, in its display cut.
    static func headline(_ size: CGFloat = 27) -> Font {
        .custom("SourceSerif4Display-Semibold", size: size, relativeTo: .title)
    }
}

/// One colour per kind of spirit; the category name is always printed with it.
enum CategoryPalette {
    static let other = Color(hex: 0xF7EA48)

    /// Matches on whole words in the category's name, so "Gin" doesn't catch "Virginia".
    static func color(for category: String) -> Color {
        let words = Set(category.lowercased().split { !$0.isLetter }.map(String.init))
        func has(_ candidates: String...) -> Bool { candidates.contains { words.contains($0) } }

        if has("bourbon") { return Color(hex: 0xFC9350) }
        if has("rye") { return Color(hex: 0x1CAA3D) }
        if has("scotch") { return Color(hex: 0xF4633A) }
        if has("irish") { return Color(hex: 0xA6DD45) }
        if has("japanese") { return Color(hex: 0xBA0C2F) }
        if has("canadian") { return Color(hex: 0x5461C8) }
        if has("american", "wheat", "corn", "light") || category.lowercased() == "single malt" { return Color(hex: 0xCA9A8E) }
        if has("whiskey", "whisky") { return Color(hex: 0xEAB8E4) }
        if has("rum", "rhum", "cachaça", "cachaca") { return Color(hex: 0x9678D3) }
        if has("gin") { return Color(hex: 0x48D597) }
        if has("vodka") { return Color(hex: 0x56B7E6) }
        if has("amaro", "amari") { return Color(hex: 0xEF426F) }
        if has("liqueur", "liqueurs") { return Color(hex: 0xE93CAC) }
        if has("agave", "tequila", "mezcal") { return Color(hex: 0x50A684) }
        if has("brandy", "cognac", "armagnac") { return Color(hex: 0x61007D) }
        return other
    }
}
