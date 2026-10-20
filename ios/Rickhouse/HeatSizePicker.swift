import SwiftUI

/// Bottles per flight, 2 to 6 (the server's range). Segmented, but a menu at accessibility sizes where five segments
/// would not fit.
struct HeatSizePicker: View {
    @Binding var size: Int
    @Environment(\.dynamicTypeSize) private var typeSize
    static let sizes = Array(2...6)

    var body: some View {
        let picker = Picker("Bottles per flight", selection: $size) { ForEach(Self.sizes, id: \.self) { Text("\($0)").tag($0) } }
        if typeSize.isAccessibilitySize { picker.pickerStyle(.menu).frame(minHeight: 44) } else { picker.pickerStyle(.segmented) }
    }
}
