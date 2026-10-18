import SwiftUI

/// The account tab: who is signed in, Muted bottles, Preferences, and sign out. Groups and
/// Config join the list when they have mobile screens.
struct AccountView: View {
    @Environment(Session.self) private var session

    var body: some View {
        NavigationStack {
            List {
                if let user = session.user {
                    Section {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.name).font(.inter(17, .semibold))
                            Text(user.username).font(.inter(14)).foregroundStyle(Theme.muted)
                        }
                        .padding(.vertical, 4)
                    }
                }
                Section {
                    NavigationLink("Muted bottles") { MutedBottlesView() }
                    NavigationLink("Preferences") { PreferencesView() }
                    // No "2 active" subtitle (the mockup has one): it would cost a request every time this tab opens.
                    NavigationLink("Tournaments") { TournamentsView() }
                }
                Section {
                    Button("Sign out", role: .destructive) { session.signOut() }.foregroundStyle(Theme.error)
                }
            }
            .font(.inter(17))
            .scrollContentBackground(.hidden)
            // A grouped list leaves a tall gap under an inline title; pull the first row up to it.
            .contentMargins(.top, 0, for: .scrollContent)
            .background(Theme.paper)
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// App-only settings, kept on the device.
struct PreferencesView: View {
    @Environment(Session.self) private var session
    @AppStorage("gridColumns") private var gridColumns = 3
    @State private var problem: String?
    @State private var choosingCurrency = false

    var body: some View {
        Form {
            if !session.currencies.isEmpty {
                Section {
                    PickerRow(title: "Currency", value: currencyTitle) { choosingCurrency = true }
                    if let problem { ErrorText(problem) }
                } footer: {
                    Text("Prices are shown and entered in this currency, on the web too. Nothing is converted.")
                }
            }
            Section {
                Picker("Gallery density", selection: $gridColumns) {
                    Text("3 columns").tag(3)
                    Text("2 columns").tag(2)
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: {
                SectionLabel("Gallery density")
            } footer: {
                Text("Two columns make the bottles larger and show a second fact under each one.")
            }
        }
        .font(.inter(17))
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle("Preferences")
        .navigationBarTitleDisplayMode(.inline)
        .task { await session.loadPreferences() }
        .optionSheet(
            "Currency", isPresented: $choosingCurrency,
            options: session.currencies.map { PickerOption(id: $0.code, title: "\($0.code) — \($0.name)") },
            selection: session.currency, onChoose: changeCurrency
        )
    }

    private var currencyTitle: String {
        session.currencies.first { $0.code == session.currency }.map { "\($0.code) — \($0.name)" } ?? session.currency
    }

    private func changeCurrency(_ code: String) {
        problem = nil
        Task {
            do { try await session.setCurrency(code) } catch { problem = error.localizedDescription }
        }
    }
}
