import SwiftUI

/// The account tab: who is signed in, Preferences, and sign out. Groups and
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
                    NavigationLink("Preferences") { PreferencesView() }
                }
                Section {
                    Button("Sign out", role: .destructive) { session.signOut() }
                }
            }
            .font(.inter(17))
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle("Account")
        }
    }
}

/// App-only settings, kept on the device.
struct PreferencesView: View {
    @AppStorage("gridColumns") private var gridColumns = 3

    var body: some View {
        Form {
            Section {
                Picker("Gallery density", selection: $gridColumns) {
                    Text("3 columns").tag(3)
                    Text("2 columns").tag(2)
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: {
                Text("Gallery density")
            } footer: {
                Text("Two columns make the bottles larger and show a second fact under each one.")
            }
        }
        .font(.inter(17))
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle("Preferences")
        .navigationBarTitleDisplayMode(.inline)
    }
}
