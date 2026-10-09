import SwiftUI

/// What to drink tonight (design spec: docs/superpowers/specs/2026-10-08-tonight-design.md). A sheet with one step per
/// screen: Spirit, then Proof, then Flavors (or "Time to open a new bottle?"), ending on one bottle. Roulette, at the
/// foot of every step, skips straight to a random one.
struct TonightFlow: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Called when a tasting was logged from the result, so the shell can show it.
    var onLogged: () -> Void

    @State private var model = TonightModel()
    @State private var path: [TonightStep] = []
    @State private var spinning = false
    @State private var collapsing = false
    @State private var problem: String?

    var body: some View {
        NavigationStack(path: $path) {
            SpiritStep(model: model, onNext: next, onRoulette: roulette)
                .navigationDestination(for: TonightStep.self) { step in
                    switch step {
                    case .proof:
                        ProofStep(model: model, onNext: next, onRoulette: roulette)
                    case .flavors:
                        FlavorsStep(model: model, onPick: { Task { await draw(model.flowRequest()) } }, onRoulette: roulette)
                    case .fallback:
                        FallbackStep(model: model, onPick: { only in Task { await draw(model.flowRequest(only: only)) } }, onRoulette: roulette)
                    case .result:
                        TonightResultView(model: model, onOpenBottle: { path.append(.bottle($0)) }, onLogged: { onLogged(); dismiss() }, onDone: { dismiss() })
                    case .bottle(let id):
                        BottleDetailView(id: id)
                    }
                }
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .background(Theme.paper)
        .overlay { if spinning { RouletteSpinner(collapsing: collapsing).transition(.opacity) } }
        .alert("Couldn't pick a bottle", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(problem ?? "")
        }
        .task { await model.loadOptions(api: session.api) }
    }

    // MARK: Moving on

    /// The step after the one on screen: Proof when it applies, then Flavors or its fallback.
    private func next() {
        let following: TonightStep
        switch path.last {
        case nil: following = model.asksProof ? .proof : (model.asksFlavors ? .flavors : .fallback)
        default: following = model.asksFlavors ? .flavors : .fallback
        }
        path.append(following)
    }

    // MARK: Drawing

    /// Draws with the steps' rules and shows the result.
    private func draw(_ request: TonightPickRequest) async {
        guard let api = session.api else { return }
        model.startOver()
        do {
            try await model.draw(request, api: api)
            show()
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            problem = error.localizedDescription
        }
    }

    /// Roulette: the card spins while the bottle is drawn, for at least a moment so it reads as a spin, then turns over.
    private func roulette() {
        guard let api = session.api, !spinning else { return }
        model.startOver()
        spinning = true
        collapsing = false
        Task {
            let started = Date()
            var failure: Error?
            do { try await model.draw(model.rouletteRequest(), api: api) } catch { failure = error }
            if !reduceMotion {
                let remaining = 1.3 - Date().timeIntervalSince(started)
                if remaining > 0 { try? await Task.sleep(for: .seconds(remaining)) }
                collapsing = true
                try? await Task.sleep(for: .milliseconds(180))
            }
            spinning = false
            collapsing = false
            if let failure {
                if case APIError.unauthorized = failure { session.signOut() } else { problem = failure.localizedDescription }
            } else {
                show()
            }
        }
    }

    private func show() {
        if path.last != .result { path.append(.result) }
    }
}

// MARK: - Shared pieces

/// The footer of every step: the sealed switch, the step's main button, and Roulette.
struct TonightFooter: View {
    @Environment(Session.self) private var session
    let model: TonightModel
    var primary: (title: String, action: () -> Void)?
    let onRoulette: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Toggle(isOn: Binding(get: { model.sealed }, set: { on in Task { await model.setSealed(on, api: session.api) } })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Include sealed bottles").font(.inter(15, .medium, relativeTo: .subheadline))
                    Text("Pouring one means opening it").font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
            }
            .tint(Theme.ink)
            .frame(minHeight: 44)

            if let primary {
                Button(action: primary.action) {
                    Text(primary.title)
                        .font(.inter(17, .semibold, relativeTo: .headline))
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(Theme.paper)
                        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
            RouletteButton(action: onRoulette)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(Theme.paper)
        .overlay(alignment: .top) { Divider() }
    }
}

/// "Step 2 of 3", in the navigation bar.
struct TonightProgress: ToolbarContent {
    let model: TonightModel
    let step: TonightStep?

    var body: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            let number = step.map { model.stepNumber(of: $0) } ?? 1
            Text("Step \(number) of \(model.stepCount)")
                .font(.inter(13, relativeTo: .footnote))
                .monospacedDigit()
                .foregroundStyle(Theme.muted)
        }
    }
}

/// A headline and its line of help, the top of every step.
struct TonightHeading: View {
    let title: String
    var detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline(30)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            if let detail { Text(detail).font(.inter(15, relativeTo: .subheadline)).foregroundStyle(Theme.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A multi-choice box: a swatch and name, and a line of counts. Chosen ones take an ink border and a check.
struct TonightBox: View {
    let title: String
    let meta: String
    var swatch: Color?
    let selected: Bool
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    if let swatch {
                        Rectangle().fill(swatch)
                            .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                            .frame(width: 14, height: 14)
                            .accessibilityHidden(true)
                    }
                    Text(title).font(.inter(17, .semibold, relativeTo: .headline)).foregroundStyle(Theme.ink)
                    Spacer(minLength: 0)
                }
                Text(meta).font(.inter(13, relativeTo: .footnote)).monospacedDigit().foregroundStyle(Theme.muted)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 76, alignment: .topLeading)
            .background(selected ? Theme.ink.opacity(0.06) : Theme.paper, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(selected ? Theme.ink : Theme.ink.opacity(0.28), lineWidth: selected ? 2 : 1))
            .overlay(alignment: .topTrailing) {
                if selected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.ink).padding(10).accessibilityHidden(true)
                }
            }
            .opacity(enabled ? 1 : 0.5)
            .contentShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(meta)")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

private struct TonightChip: View {
    let label: String
    let count: Int
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(label).font(.inter(15, .medium, relativeTo: .subheadline))
                Text("\(count)").font(.inter(12, relativeTo: .caption)).monospacedDigit().opacity(0.7)
            }
            .foregroundStyle(selected ? Theme.paper : Theme.ink)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(selected ? Theme.ink : Theme.paper, in: Capsule())
            .overlay(Capsule().strokeBorder(selected ? Theme.ink : Theme.ink.opacity(0.28), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label), tasted \(count) times")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Shown where a step's data hasn't arrived yet, or couldn't.
private struct TonightLoading: View {
    let error: String?
    let retry: () -> Void

    var body: some View {
        if let error {
            ContentUnavailableView {
                Label("Couldn't load", systemImage: "wifi.slash")
            } description: {
                Text(error)
            } actions: {
                Button("Try again", action: retry)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, minHeight: 160)
        }
    }
}

// MARK: - Spirit

struct SpiritStep: View {
    @Environment(Session.self) private var session
    let model: TonightModel
    let onNext: () -> Void
    let onRoulette: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                TonightHeading(title: "Which shelf tonight?", detail: "Pick one or several. Pick none and anything goes.")
                if let options = model.options {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(options.spirits) { spirit in
                            let available = spirit.open + (model.sealed ? spirit.sealed : 0)
                            TonightBox(
                                title: spirit.name,
                                meta: Self.meta(spirit, includingSealed: model.sealed),
                                swatch: CategoryPalette.color(for: spirit.name),
                                selected: model.categories.contains(spirit.categoryId) && available > 0,
                                enabled: available > 0
                            ) {
                                model.toggle(category: spirit.categoryId)
                                Task { await model.loadOptions(api: session.api) }
                            }
                        }
                    }
                } else {
                    TonightLoading(error: model.loadError) { Task { await model.loadOptions(api: session.api) } }
                }
            }
            .padding(EdgeInsets(top: 4, leading: 20, bottom: 20, trailing: 20))
        }
        .background(Theme.paper)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { TonightProgress(model: model, step: nil) }
        .safeAreaInset(edge: .bottom) {
            TonightFooter(model: model, primary: (model.categories.isEmpty ? "Any spirit, next" : "Next", onNext), onRoulette: onRoulette)
        }
    }

    /// "5 open · +2 sealed · 1 muted". With nothing open the sealed count stands plain, and a spirit with nothing to
    /// draw reads "None open".
    static func meta(_ spirit: TonightOptions.Spirit, includingSealed: Bool) -> String {
        var parts = [spirit.open > 0 ? "\(spirit.open) open" : "None open"]
        if spirit.sealed > 0 { parts.append((spirit.open > 0 && !includingSealed ? "+" : "") + "\(spirit.sealed) sealed") }
        if spirit.muted > 0 { parts.append("\(spirit.muted) muted") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Proof

struct ProofStep: View {
    let model: TonightModel
    let onNext: () -> Void
    let onRoulette: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                TonightHeading(title: "How hard a pour?", detail: "Pick as many as you like.")
                if let options = model.options {
                    VStack(spacing: 10) {
                        ForEach(options.proof.bands) { band in
                            TonightBox(
                                title: band.label,
                                meta: "\(band.range) · " + (band.count == 0 ? "none" : band.count == 1 ? "1 bottle" : "\(band.count) bottles"),
                                selected: model.bands.contains(band.key) && band.count > 0,
                                enabled: band.count > 0
                            ) { model.toggle(band: band.key) }
                        }
                    }
                }
            }
            .padding(EdgeInsets(top: 4, leading: 20, bottom: 20, trailing: 20))
        }
        .background(Theme.paper)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { TonightProgress(model: model, step: .proof) }
        .safeAreaInset(edge: .bottom) {
            TonightFooter(model: model, primary: (model.bands.isEmpty ? "Any proof, next" : "Next", onNext), onRoulette: onRoulette)
        }
    }
}

// MARK: - Flavors

struct FlavorsStep: View {
    let model: TonightModel
    let onPick: () -> Void
    let onRoulette: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                TonightHeading(
                    title: "What are you tasting for?",
                    detail: "From your own tasting notes. They nudge the draw and never rule a bottle out."
                )
                if let flavors = model.options?.flavors {
                    FlowLayout(spacing: 8) {
                        ForEach(flavors.tags) { tag in
                            TonightChip(label: tag.label, count: tag.count, selected: model.flavors.contains(tag.key)) { model.toggle(flavor: tag.key) }
                        }
                    }
                    if !flavors.skipped.isEmpty {
                        let names = flavors.skipped.map(\.name)
                        Text("No flavors for \(Self.list(names).lowercased()) yet. \(names.count > 1 ? "Each has" : "It has") under \(model.options?.limits.minSpiritTastings ?? 10) tastings. \(names.count > 1 ? "Their" : "Its") bottles stay in the draw.")
                            .font(.inter(13, relativeTo: .footnote))
                            .foregroundStyle(Theme.muted)
                            .padding(.leading, 10)
                            .overlay(alignment: .leading) { Rectangle().fill(Theme.ink).frame(width: 2) }
                    }
                }
            }
            .padding(EdgeInsets(top: 4, leading: 20, bottom: 20, trailing: 20))
        }
        .background(Theme.paper)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { TonightProgress(model: model, step: .flavors) }
        .safeAreaInset(edge: .bottom) {
            TonightFooter(model: model, primary: (model.flavors.isEmpty ? "Skip flavors, pick for me" : "Pick for me", onPick), onRoulette: onRoulette)
        }
    }

    /// "Rye, scotch and rum".
    static func list(_ words: [String]) -> String {
        words.count > 1 ? words.dropLast().joined(separator: ", ") + " and " + words[words.count - 1] : (words.first ?? "")
    }
}

// MARK: - Too few tastings

/// Flavors are off: the spirits chosen don't have the tastings to match on yet. "Time to open a new bottle?"
struct FallbackStep: View {
    let model: TonightModel
    /// "sealed" or "open": which of the two buttons.
    let onPick: (String) -> Void
    let onRoulette: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let fallback = model.options?.fallback {
                    let names = FlavorsStep.list(fallback.spirits).lowercased()
                    let limit = model.options?.limits.minSpiritTastings ?? 10
                    TonightHeading(
                        title: Self.headline(tastings: fallback.tastings, names: names, everyone: model.categories.isEmpty) + " Time to open a new bottle?",
                        detail: "Flavor picks need \(limit) tastings of a spirit before they mean anything."
                    )
                    VStack(spacing: 10) {
                        if fallback.sealed > 0 {
                            Button { onPick("sealed") } label: {
                                Text("Pick a sealed " + (fallback.spirits.count == 1 ? names : "bottle"))
                                    .font(.inter(17, .semibold, relativeTo: .headline))
                                    .frame(maxWidth: .infinity, minHeight: 50)
                                    .foregroundStyle(Theme.paper)
                                    .background(Theme.ink, in: RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                        Button { onPick("open") } label: {
                            Text("Pick from what is open")
                                .font(.inter(17, .semibold, relativeTo: .headline))
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .foregroundStyle(Theme.ink)
                                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.ink, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(fallback.open == 0)
                        .opacity(fallback.open == 0 ? 0.5 : 1)
                    }
                    Text(fallback.sealed > 0
                         ? "\(fallback.sealed) sealed on the shelf. Choosing one opens it."
                         : "Nothing sealed in \(names), so the pick comes from what is open.")
                        .font(.inter(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.muted)
                        .padding(.leading, 10)
                        .overlay(alignment: .leading) { Rectangle().fill(Theme.ink).frame(width: 2) }
                }
            }
            .padding(EdgeInsets(top: 4, leading: 20, bottom: 20, trailing: 20))
        }
        .background(Theme.paper)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { TonightProgress(model: model, step: .fallback) }
        .safeAreaInset(edge: .bottom) {
            TonightFooter(model: model, primary: nil, onRoulette: onRoulette)
        }
    }

    /// "9 rye tastings so far.", or the plain version when every spirit is in.
    static func headline(tastings: Int, names: String, everyone: Bool) -> String {
        everyone ? "Not enough tastings yet." : "\(tastings) \(names) \(tastings == 1 ? "tasting" : "tastings") so far."
    }
}
