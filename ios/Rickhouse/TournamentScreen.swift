import SwiftUI

/// Placeholder until the bracket screen (plan 5, task 5) replaces it: loads one tournament and names it.
struct TournamentScreen: View {
    @Environment(Session.self) private var session
    let id: Int

    @State private var tournament: TournamentView?
    @State private var error: String?

    var body: some View {
        Group {
            if let tournament {
                VStack(spacing: 8) {
                    Text(tournament.name).font(.headline(27))
                    Text(tournament.status.rawValue.capitalized).foregroundStyle(Theme.muted)
                }
            } else if let error {
                ContentUnavailableView("Couldn't load", systemImage: "wifi.slash", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard let api = session.api else { return }
            do { tournament = try await api.tournament(id: id) } catch APIError.unauthorized { session.signOut() } catch { self.error = error.localizedDescription }
        }
    }
}
