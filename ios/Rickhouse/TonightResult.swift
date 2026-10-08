import SwiftUI

/// The pick: one bottle in its category's frame, a line written from your own data, what it is, and why it came up.
/// Not feeling it? Draw another, or mute it for a while.
struct TonightResultView: View {
    @Environment(Session.self) private var session
    let model: TonightModel
    let onOpenBottle: (Int) -> Void
    /// A tasting was saved.
    let onLogged: () -> Void
    let onDone: () -> Void

    @State private var presets: [MutePreset] = []
    @State private var choosingMute = false
    @State private var toast: Toast?
    @State private var logging: LogTarget?
    @State private var busy = false
    @State private var problem: String?

    private struct Toast: Equatable, Identifiable {
        let id = UUID()
        let message: String
        /// The bottle to unmute, when the toast offers Undo.
        var undoBottleId: Int?
    }

    private struct LogTarget: Identifiable {
        let id = UUID()
        let label: TastingLabel
        let bottle: TastingBottle
    }

    var body: some View {
        Group {
            if let pick = model.pick {
                ScrollView { content(pick).padding(20) }
                    .id(pick.bottle.id)
                    .safeAreaInset(edge: .bottom) { footer(pick) }
            } else {
                emptyState
            }
        }
        .background(Theme.paper)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Tonight").font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted)
            }
        }
        .overlay(alignment: .top) { toastView }
        .confirmationDialog(muteTitle, isPresented: $choosingMute, titleVisibility: .visible) {
            ForEach(presets) { preset in
                Button("\(preset.label), until \(Format.day(preset.until))") { mute(until: preset.until) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("It stays out of every pick, Roulette included. Settings shows it, and lets you change the date or clear it.")
        }
        .sheet(item: $logging) { target in
            NavigationStack {
                TastingFormView(label: target.label, bottle: target.bottle) { logging = nil; onLogged() }
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { logging = nil } } }
            }
        }
        .alert("Something went wrong", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(problem ?? "")
        }
    }

    private var muteTitle: String { model.pick.map { "Mute \($0.bottle.title) for…" } ?? "Mute for…" }

    // MARK: Content

    private func content(_ pick: TonightPick) -> some View {
        let bottle = pick.bottle
        let color = CategoryPalette.color(for: bottle.category)
        return VStack(alignment: .leading, spacing: 0) {
            hero(bottle, color: color)
            HStack(spacing: 8) {
                Rectangle().fill(color)
                    .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                    .frame(width: 10, height: 10)
                    .accessibilityHidden(true)
                Text(bottle.category.uppercased())
                    .font(.inter(12, .semibold, relativeTo: .caption))
                    .tracking(1)
                    .foregroundStyle(Theme.muted)
            }
            .padding(.top, 14)
            Text(bottle.title)
                .font(.inter(21, .semibold, relativeTo: .title3))
                .foregroundStyle(Theme.ink)
                .padding(.top, 4)
            Text(bottle.quip)
                .font(.headline(24))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
                .padding(.bottom, 12)
            facts(bottle)
            ForEach(pick.why, id: \.self) { line in
                Text(line).font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted).padding(.top, 10)
            }
            if bottle.sealed {
                Text("This one is sealed. Pouring it opens it, and the bottle moves to open on your shelf.")
                    .font(.inter(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.ink)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                    .padding(.top, 12)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func hero(_ bottle: TonightPick.Bottle, color: Color) -> some View {
        AuthenticatedImage(path: bottle.thumbPath, contentMode: .fit, background: .clear)
            .padding(6)
            .frame(maxWidth: .infinity)
            .frame(height: 170)
            .clipped()
            .padding(8)
            .background(color)
            .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
            .overlay(alignment: .trailing) {
                if !bottle.sealed {
                    FillGauge(percent: bottle.fillPct).frame(width: 3).padding(.vertical, 8).padding(.trailing, 2)
                }
            }
            .overlay(alignment: .topLeading) {
                if bottle.sealed {
                    Text("SEALED")
                        .font(.inter(11, .semibold, relativeTo: .caption2))
                        .tracking(1.2)
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.paper)
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        .padding(16)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(bottle.sealed ? "Photo of \(bottle.title), sealed" : "Photo of \(bottle.title), \(FillState.of(bottle.fillPct).spoken)")
    }

    private func facts(_ bottle: TonightPick.Bottle) -> some View {
        VStack(spacing: 6) {
            fact("Proof", bottle.proof.map { $0.formatted() })
            fact("Fill", bottle.sealed ? "Sealed" : FillState.of(bottle.fillPct).text)
            fact("Bought", bottle.dateAcquired.map(Format.day))
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { Divider() }
        .overlay(alignment: .bottom) { Divider() }
    }

    @ViewBuilder
    private func fact(_ name: String, _ value: String?) -> some View {
        if let value {
            HStack {
                Text(name).foregroundStyle(Theme.muted)
                Spacer()
                Text(value).fontWeight(.medium).foregroundStyle(Theme.ink)
            }
            .font(.inter(15, relativeTo: .subheadline))
            .monospacedDigit()
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: Footer

    private func footer(_ pick: TonightPick) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { startLog(pick.bottle) } label: {
                HStack {
                    if busy { ProgressView().tint(Theme.paper) }
                    Text("Log a tasting for this bottle")
                }
                .font(.inter(17, .semibold, relativeTo: .headline))
                .frame(maxWidth: .infinity, minHeight: 50)
                .foregroundStyle(Theme.paper)
                .background(Theme.ink, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(busy)

            Text("NOT FEELING IT?")
                .font(.inter(12, .semibold, relativeTo: .caption))
                .tracking(1)
                .foregroundStyle(Theme.muted)
                .padding(.top, 2)
                .accessibilityHidden(true)
            HStack(spacing: 10) {
                tile(symbol: "arrow.clockwise", title: "Not this one", detail: "Draw another now") { drawAnother() }
                tile(symbol: "bell.slash", title: "Mute for a while", detail: "Hide it from picks") { chooseMute() }
            }
            HStack {
                Button("Open bottle") { onOpenBottle(pick.bottle.id) }
                    .frame(minHeight: 44)
                Spacer()
                Button("Done", action: onDone).frame(minHeight: 44)
            }
            .font(.inter(16, .medium, relativeTo: .body))
            .foregroundStyle(Theme.ink)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 4)
        .background(Theme.paper)
        .overlay(alignment: .top) { Divider() }
    }

    private func tile(symbol: String, title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .medium))
                    .frame(width: 34, height: 34)
                    .overlay(Circle().strokeBorder(Theme.ink, lineWidth: 1))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.inter(15, .semibold, relativeTo: .subheadline))
                    Text(detail).font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.ink, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title). \(detail)")
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 16) {
            TonightHeading(
                title: model.shown.isEmpty ? "Nothing fits." : "That is everything that fits.",
                detail: model.shown.isEmpty
                    ? "Go back and loosen the proof, or include sealed bottles."
                    : "You have passed on every bottle in play."
            )
            Button(action: onDone) {
                Text("Done")
                    .font(.inter(17, .semibold, relativeTo: .headline))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(Theme.paper)
                    .background(Theme.ink, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
        }
        .padding(20)
    }

    // MARK: Actions

    private func startLog(_ bottle: TonightPick.Bottle) {
        guard let api = session.api, !busy else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                // The bottle page knows the label's flavor wheel, which a tasting needs.
                let detail = try await api.bottle(id: bottle.id)
                await session.loadWheels()
                logging = LogTarget(
                    label: TastingLabel(id: detail.expressionId ?? bottle.expressionId, title: bottle.title, category: bottle.category, wheel: detail.wheel),
                    bottle: TastingBottle(id: bottle.id, title: bottle.title)
                )
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    private func drawAnother() {
        guard let api = session.api else { return }
        Task {
            do {
                try await model.drawAgain(api: api)
                announce()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    private func chooseMute() {
        guard let api = session.api else { return }
        Task {
            do {
                presets = try await api.mutes().presets
                choosingMute = true
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    /// Mutes the bottle on screen, then draws another in its place. Undo takes the mute off again.
    private func mute(until: String) {
        guard let api = session.api, let current = model.pick?.bottle else { return }
        Task {
            do {
                try await api.mute(bottleId: current.id, until: until)
                try await model.drawAgain(api: api)
                show(Toast(message: "Muted \(current.title) until \(Format.day(until)).", undoBottleId: current.id))
                announce()
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    private func undoMute(_ bottleId: Int) {
        guard let api = session.api else { return }
        toast = nil
        Task {
            do {
                try await api.unmute(bottleId: bottleId)
                show(Toast(message: "Unmuted."))
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }

    private func announce() {
        guard let pick = model.pick else { return }
        AccessibilityNotification.Announcement("Now showing \(pick.bottle.title). \(pick.bottle.quip)").post()
    }

    // MARK: Toast

    private func show(_ new: Toast) {
        withAnimation { toast = new }
        Task {
            try? await Task.sleep(for: .seconds(new.undoBottleId == nil ? 2.6 : 6))
            if toast?.id == new.id { withAnimation { toast = nil } }
        }
    }

    @ViewBuilder
    private var toastView: some View {
        if let toast {
            HStack(spacing: 12) {
                Text(toast.message).font(.inter(14, relativeTo: .subheadline)).frame(maxWidth: .infinity, alignment: .leading)
                if let id = toast.undoBottleId {
                    Button("Undo") { undoMute(id) }.font(.inter(14, .semibold, relativeTo: .subheadline)).frame(minHeight: 44)
                }
            }
            .foregroundStyle(Theme.paper)
            .padding(.horizontal, 14)
            .padding(.vertical, 2)
            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

extension TonightPick.Bottle {
    /// The serif line under the name, written from your own data.
    var quip: String {
        if sealed {
            let since = dateAcquired.map { "Sealed since \(Format.monthYear($0))." } ?? "Sealed, and not poured yet."
            return since + " Tonight could be the night."
        }
        if fillPct <= 25 { return "Under a quarter left. Pour it while it is here." }
        if let last = lastTasted {
            let month = Format.monthName(last.on)
            if let rating = last.rating { return "You gave it \(rating.formatted()) out of 10 in \(month)." }
            return "You last tasted it in \(month)."
        }
        return "Open, and never tasted. Fix that."
    }
}
