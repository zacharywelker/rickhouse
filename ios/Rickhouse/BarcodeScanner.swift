import AVFoundation
import SwiftUI
import VisionKit

/// The camera, reading one barcode. A UPC-A comes through as an EAN-13 with a leading zero.
/// It needs a real camera and the user's permission, so `isAvailable` is false in the Simulator.
struct BarcodeScanner: UIViewControllerRepresentable {
    var onCode: (String) -> Void

    static var isAvailable: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        // Scanning can only start once the view is on screen.
        if !scanner.isScanning { try? scanner.startScanning() }
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var done = false

        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for case .barcode(let barcode) in addedItems {
                guard !done, let value = barcode.payloadStringValue else { continue }
                done = true
                onCode(value)
                return
            }
        }
    }
}

/// The phone's flashlight, for scanning in a dim shop or cellar.
///
/// The camera is picked through a discovery session of the back cameras, not `AVCaptureDevice.default`:
/// switching the torch on a different device object froze VisionKit's feed on an iPhone. This follows the fix
/// reported in Apple's developer forums ("DataScannerViewController freezes when enabling torch using AVCaptureDevice").
enum Torch {
    private static var device: AVCaptureDevice? {
        AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInTripleCamera, .builtInDualWideCamera, .builtInUltraWideCamera, .builtInWideAngleCamera],
            mediaType: .video,
            position: .back
        ).devices.first { $0.hasTorch }
    }

    static var isAvailable: Bool { device != nil }

    static func set(_ on: Bool) {
        guard let device, (try? device.lockForConfiguration()) != nil else { return }
        device.torchMode = on ? .on : .off
        device.unlockForConfiguration()
    }
}

/// The scanner full screen, with a way out, a flashlight and a way to type the code instead.
/// A read code gives a light tap and "Got it" before the lookup starts.
struct ScanScreen: View {
    var onCode: (String) -> Void
    var onType: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var found = false

    var body: some View {
        ZStack {
            if BarcodeScanner.isAvailable {
                BarcodeScanner(onCode: read).ignoresSafeArea()
            } else {
                ContentUnavailableView(
                    "No camera to scan with",
                    systemImage: "camera.metering.unknown",
                    description: Text("The camera isn't available here, or its access is off in Settings. You can type the code instead.")
                )
                .background(Theme.paper)
            }
            VStack {
                HStack {
                    Button("Cancel") { dismiss() }
                        .buttonStyle(.borderedProminent)
                        .tint(Theme.ink)
                    Spacer()
                    if BarcodeScanner.isAvailable && Torch.isAvailable { TorchButton() }
                }
                Spacer()
                if BarcodeScanner.isAvailable {
                    Text(found ? "Got it" : "Point the camera at the bottle's barcode.")
                        .font(.inter(15, .medium, relativeTo: .subheadline))
                        .foregroundStyle(Theme.paper)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Theme.ink.opacity(0.8), in: Capsule())
                }
                Button("Enter the code instead", action: onType)
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.ink)
                    .padding(.top, 8)
            }
            .padding(16)
        }
    }

    /// A light tap and "Got it", then the code goes on a moment later so the cue is seen.
    private func read(_ code: String) {
        guard !found else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        found = true
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            onCode(code)
        }
    }
}

/// The flashlight switch. Its on/off state lives here, so toggling it re-draws only this button.
private struct TorchButton: View {
    @State private var on = false

    var body: some View {
        Button {
            on.toggle()
            Torch.set(on)
        } label: {
            Image(systemName: on ? "flashlight.on.fill" : "flashlight.off.fill")
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.borderedProminent)
        .tint(Theme.ink)
        .accessibilityLabel(on ? "Turn the flashlight off" : "Turn the flashlight on")
        .onDisappear { if on { Torch.set(false) } }
    }
}
