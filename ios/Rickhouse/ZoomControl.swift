import SwiftUI

extension ZoomLevel {
    var title: String {
        switch self {
        case .detail: "Detail"
        case .compact: "Compact"
        case .map: "Map"
        }
    }
}

/// "− Detail +": one level of zoom per press, 44 pt buttons that switch off at the ends. A pinch on the bracket does the
/// same (`pinchZoom`), but these are the way for anyone who cannot pinch.
struct ZoomControl: View {
    let level: ZoomLevel
    let onChange: (ZoomLevel) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 0))
        layout {
            Text("Zoom, or pinch").font(.inter(13)).foregroundStyle(Theme.muted)
            if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
            HStack(spacing: 0) {
                step("minus", label: "Zoom out, \(level.zoomedOut.title)", enabled: level.canZoomOut) { onChange(level.zoomedOut) }
                Text(level.title)
                    .font(.inter(15, .semibold))
                    .frame(minWidth: 72)
                    .accessibilityLabel("Zoom level")
                    .accessibilityValue(level.title)
                step("plus", label: "Zoom in, \(level.zoomedIn.title)", enabled: level.canZoomIn) { onChange(level.zoomedIn) }
            }
        }
        .frame(minHeight: 44)
    }

    private func step(_ symbol: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 18, weight: .semibold)).frame(width: 44, height: 44)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(enabled ? Theme.ink : Theme.muted.opacity(0.4), lineWidth: 1).frame(width: 40, height: 40))
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? Theme.ink : Theme.muted.opacity(0.4))
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

extension View {
    /// A pinch steps one level: closing the fingers zooms out toward the map, opening them zooms in.
    func pinchZoom(_ level: ZoomLevel, onChange: @escaping (ZoomLevel) -> Void) -> some View {
        simultaneousGesture(MagnifyGesture().onEnded { value in
            if value.magnification < 0.85, level.canZoomOut { onChange(level.zoomedOut) }
            else if value.magnification > 1.18, level.canZoomIn { onChange(level.zoomedIn) }
        })
    }
}
