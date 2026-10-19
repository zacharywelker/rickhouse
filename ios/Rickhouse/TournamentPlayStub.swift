import SwiftUI

/// The smallest screen Play can open until the play flow replaces it.
struct PlayFlightView: View {
    let tournamentID: Int
    let heatID: Int
    var drawn: DrawnHeat?

    var body: some View {
        ContentUnavailableView("Playing a flight", systemImage: "wineglass", description: Text("This screen is not built yet."))
            .navigationTitle("Flight")
            .navigationBarTitleDisplayMode(.inline)
    }
}
