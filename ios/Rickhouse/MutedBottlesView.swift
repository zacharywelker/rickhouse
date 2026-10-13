import SwiftUI

/// Account, Muted bottles: what is held out of What to drink tonight and Roulette, with the date each comes back. Change
/// a date within the allowed window, or clear a mute. The list is the account's, so every device shows the same one.
struct MutedBottlesView: View {
    @Environment(Session.self) private var session

    @State private var response: MutesResponse?
    @State private var error: String?
    @State private var editing: MutedBottle?
    @State private var confirmingClearAll = false
    @State private var foot = FootBar()

    var body: some View {
        Group {
            if let response {
                list(response)
            } else if let error {
                ContentUnavailableView {
                    Label("Couldn't load", systemImage: "wifi.slash")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else {
                ProgressView()
            }
        }
        .background(Theme.paper)
        .navigationTitle("Muted bottles")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let mutes = response?.mutes, mutes.count > 1 {
                ToolbarItem(placement: .topBarTrailing) { Button("Clear all") { confirmingClearAll = true } }
            }
        }
        .footBar(foot) { runUndo($0) }
        .confirmSheet("Clear every mute?", message: "They can all come up in picks again.", confirm: "Clear all mutes", isPresented: $confirmingClearAll) { clearAll() }
        .sheet(item: $editing) { bottle in
            if let window = response?.window {
                MuteDateSheet(bottle: bottle, window: window) { until in
                    editing = nil
                    change(bottle, to: until)
                }
            }
        }
        .task { await load() }
    }

    private func list(_ response: MutesResponse) -> some View {
        List {
            Section {
                ForEach(response.mutes) { bottle in
                    Button { editing = bottle } label: { row(bottle) }
                        .buttonStyle(.plain)
                        .swipeActions {
                            Button("Clear", role: .destructive) { clear(bottle) }.tint(Theme.error)
                        }
                }
            } header: {
                Text("Out of every pick, Roulette included, until their date.")
                    .textCase(nil)
                    .font(.inter(13, relativeTo: .footnote))
            } footer: {
                if response.mutes.isEmpty {
                    Text("Nothing is muted. Mute a bottle from a pick when you are not feeling it.")
                } else {
                    Text("Tap a bottle to change its date, or swipe to clear it.")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .font(.inter(16))
    }

    private func row(_ bottle: MutedBottle) -> some View {
        HStack(spacing: 12) {
            Rectangle().fill(CategoryPalette.color(for: bottle.category))
                .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                .frame(width: 12, height: 12)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(bottle.title).font(.inter(16, .medium)).foregroundStyle(Theme.ink)
                Text("\(bottle.category) · until \(Format.day(bottle.mutedUntil))")
                    .font(.inter(13))
                    .monospacedDigit()
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Changes the date")
    }

    // MARK: Actions

    private func load() async {
        guard let api = session.api else { return }
        do {
            response = try await api.mutes()
            error = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            if response == nil { self.error = error.localizedDescription }
        }
    }

    private func change(_ bottle: MutedBottle, to until: String) {
        guard let api = session.api else { return }
        let before = bottle.mutedUntil
        Task {
            await attempt(retry: { change(bottle, to: until) }) {
                try await api.mute(bottleId: bottle.bottleId, until: until)
                await load()
                foot.offer(UndoOffer(message: "\(bottle.title) is muted until \(Format.day(until)).") { try await api.mute(bottleId: bottle.bottleId, until: before) })
            }
        }
    }

    private func clear(_ bottle: MutedBottle) {
        guard let api = session.api else { return }
        Task {
            await attempt(retry: { clear(bottle) }) {
                try await api.unmute(bottleId: bottle.bottleId)
                await load()
                foot.offer(UndoOffer(message: "Cleared the mute on \(bottle.title).") { try await api.mute(bottleId: bottle.bottleId, until: bottle.mutedUntil) })
            }
        }
    }

    private func clearAll() {
        guard let api = session.api, let mutes = response?.mutes else { return }
        Task {
            await attempt(retry: { clearAll() }) {
                for bottle in mutes { try await api.unmute(bottleId: bottle.bottleId) }
                await load()
                foot.offer(UndoOffer(message: "Cleared all mutes.") {
                    for item in mutes { try await api.mute(bottleId: item.bottleId, until: item.mutedUntil) }
                })
            }
        }
    }

    private func runUndo(_ offer: UndoOffer) {
        foot.dropUndo()
        Task {
            await attempt(retry: { runUndo(offer) }) {
                try await offer.run()
                await load()
            }
        }
    }

    private func attempt(retry: @escaping () -> Void, _ work: () async throws -> Void) async {
        do {
            try await work()
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            foot.fail(error, retry: retry)
            await load()
        }
    }
}

/// Pick a new end date for one muted bottle, within the window the server allows (tomorrow to three months from today).
private struct MuteDateSheet: View {
    @Environment(\.dismiss) private var dismiss
    let bottle: MutedBottle
    let window: MuteWindow
    let onSave: (String) -> Void

    @State private var date: Date

    init(bottle: MutedBottle, window: MuteWindow, onSave: @escaping (String) -> Void) {
        self.bottle = bottle
        self.window = window
        self.onSave = onSave
        let current = Format.date(fromISO: bottle.mutedUntil) ?? Format.date(fromISO: window.min) ?? Date()
        _date = State(initialValue: current)
    }

    private var range: ClosedRange<Date> {
        let low = Format.date(fromISO: window.min) ?? Date()
        let high = Format.date(fromISO: window.max) ?? low
        return low...max(low, high)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Muted until", selection: $date, in: range, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .tint(Theme.ink)
                } header: {
                    Text(bottle.title).textCase(nil).font(.inter(15, .medium))
                } footer: {
                    Text("A mute lasts at most three months, so the bottle always comes back.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle("Change date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { onSave(Format.isoDay(date)) } }
            }
        }
        .presentationDetents([.large])
    }
}
