import SwiftUI

/// Account, Muted bottles: what is held out of What to drink tonight and Roulette, with the date each comes back. Change
/// a date within the allowed window, or clear a mute. The list is the account's, so every device shows the same one.
struct MutedBottlesView: View {
    @Environment(Session.self) private var session

    @State private var response: MutesResponse?
    @State private var error: String?
    @State private var editing: MutedBottle?
    @State private var confirmingClearAll = false
    @State private var toast: Toast?

    private struct Toast: Equatable, Identifiable {
        let id = UUID()
        let message: String
        /// What Undo puts back: each bottle and the date it was muted until.
        var restore: [Restore] = []
    }

    private struct Restore: Equatable {
        let bottleId: Int
        let until: String
    }

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
        .overlay(alignment: .bottom) { toastView }
        .confirmationDialog("Clear every mute?", isPresented: $confirmingClearAll, titleVisibility: .visible) {
            Button("Clear all mutes", role: .destructive) { clearAll() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They can all come up in picks again.")
        }
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
            await attempt {
                try await api.mute(bottleId: bottle.bottleId, until: until)
                await load()
                show(Toast(message: "\(bottle.title) is muted until \(Format.day(until)).", restore: [Restore(bottleId: bottle.bottleId, until: before)]))
            }
        }
    }

    private func clear(_ bottle: MutedBottle) {
        guard let api = session.api else { return }
        Task {
            await attempt {
                try await api.unmute(bottleId: bottle.bottleId)
                await load()
                show(Toast(message: "Cleared the mute on \(bottle.title).", restore: [Restore(bottleId: bottle.bottleId, until: bottle.mutedUntil)]))
            }
        }
    }

    private func clearAll() {
        guard let api = session.api, let mutes = response?.mutes else { return }
        Task {
            await attempt {
                for bottle in mutes { try await api.unmute(bottleId: bottle.bottleId) }
                await load()
                show(Toast(message: "Cleared all mutes.", restore: mutes.map { Restore(bottleId: $0.bottleId, until: $0.mutedUntil) }))
            }
        }
    }

    private func undo(_ toast: Toast) {
        guard let api = session.api else { return }
        self.toast = nil
        Task {
            await attempt {
                for item in toast.restore { try await api.mute(bottleId: item.bottleId, until: item.until) }
                await load()
            }
        }
    }

    private func attempt(_ work: () async throws -> Void) async {
        do {
            try await work()
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            show(Toast(message: error.localizedDescription))
            await load()
        }
    }

    // MARK: Toast

    private func show(_ new: Toast) {
        withAnimation { toast = new }
        Task {
            try? await Task.sleep(for: .seconds(new.restore.isEmpty ? 3 : 6))
            if toast?.id == new.id { withAnimation { toast = nil } }
        }
    }

    @ViewBuilder
    private var toastView: some View {
        if let toast {
            HStack(spacing: 12) {
                Text(toast.message).font(.inter(14, relativeTo: .subheadline)).frame(maxWidth: .infinity, alignment: .leading)
                if !toast.restore.isEmpty {
                    Button("Undo") { undo(toast) }.font(.inter(14, .semibold, relativeTo: .subheadline)).frame(minHeight: 44)
                }
            }
            .foregroundStyle(Theme.paper)
            .padding(.horizontal, 14)
            .padding(.vertical, 2)
            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
            .transition(.move(edge: .bottom).combined(with: .opacity))
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
