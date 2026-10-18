import SwiftUI

/// Placeholder until the new-tournament form (plan 5, task 4) replaces it.
struct NewTournamentView: View {
    var onCreated: (Int) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Text("New tournament").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
