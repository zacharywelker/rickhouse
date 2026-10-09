import SwiftUI

/// One label, read rather than edited. Top to bottom: its header (the way into your bottles of it, if you have any),
/// a button to log a tasting, your tastings, a box offering the bottle if you don't have it, and the label's facts.
/// Bottle details live in the Collection tab, so none are shown here.
struct LabelPage: View {
    /// How many tastings sit on the page before "See all".
    static let shownTastings = 3

    @Environment(Session.self) private var session
    let id: Int
    @State private var label: LabelDetail?
    @State private var error: String?
    @State private var loggingTasting = false
    @State private var deletingTasting: Int?
    @State private var addingBottle = false
    @State private var viewingPhoto = false

    var body: some View {
        Group {
            if let label {
                content(label)
            } else if let error {
                ContentUnavailableView {
                    Label("Couldn't load this label", systemImage: "exclamationmark.triangle")
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
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .task { await session.loadWheels() }
        .confirmsTastingDeletion($deletingTasting) { _ in Task { await load() } }
        .fullScreenCover(isPresented: $viewingPhoto) {
            if let label, let path = label.photoPath {
                PhotoViewer(
                    subject: .label(expressionId: label.id),
                    title: "\(label.brand) \(label.name)",
                    photos: [ViewerPhoto(id: 0, path: path, isHero: true)],
                    selection: 0
                ) { Task { await load() } }
            }
        }
        .sheet(isPresented: $loggingTasting) {
            if let label {
                LogTastingForLabel(label: label) {
                    loggingTasting = false
                    Task { await load() }
                }
            }
        }
        .sheet(isPresented: $addingBottle) {
            if let label {
                NavigationStack {
                    BottleFormView(label: LabelOption(label)) {
                        addingBottle = false
                        Task { await load() }
                    }
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { addingBottle = false } } }
                }
            }
        }
    }

    private func content(_ l: LabelDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header(l)
                Button { loggingTasting = true } label: {
                    Text("Log a tasting")
                        .font(.inter(16, .semibold))
                        .foregroundStyle(Theme.paper)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Theme.ink, in: RoundedRectangle(cornerRadius: 4))
                }
                .padding(.top, 12)

                sectionTitle("Your tastings")
                tastings(l)

                if l.bottles.isEmpty { notOwned }
                about(l)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }

    // MARK: Header

    private func header(_ l: LabelDetail) -> some View {
        let plate = CategoryPalette.color(for: l.category)
        let block = HStack(spacing: 12) {
            Button { viewingPhoto = true } label: {
                LabelThumb(path: l.photoThumbPath ?? l.photoPath, category: l.category, width: 54)
            }
            .buttonStyle(.plain)
            .disabled(l.photoPath == nil)
            .accessibilityLabel("Photo of \(l.brand) \(l.name)")
            .accessibilityHint(l.photoPath == nil ? "" : "Opens it full screen")
            VStack(alignment: .leading, spacing: 2) {
                Text(l.brand).font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted)
                Text(l.name).font(.headline(21)).foregroundStyle(Theme.ink)
                HStack(spacing: 5) {
                    Rectangle().fill(plate)
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    Text([l.category, Format.proof(l.proof)].compactMap { $0 }.joined(separator: " · "))
                        .font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
            }
            Spacer(minLength: 0)
            if !l.bottles.isEmpty {
                VStack(alignment: .trailing, spacing: 0) {
                    Text("\(l.bottles.count)").font(.inter(20, .semibold)).monospacedDigit()
                    Text(l.bottles.count == 1 ? "bottle ›" : "bottles ›").font(.inter(11, .semibold, relativeTo: .caption2))
                }
                .foregroundStyle(Theme.ink)
                .accessibilityHidden(true)
            }
        }
        .padding(10)
        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
        .contentShape(Rectangle())

        return Group {
            if let only = l.bottles.first, l.bottles.count == 1 {
                NavigationLink { BottleDetailView(id: only.id) } label: { block }
                    .accessibilityLabel("\(l.brand) \(l.name), 1 bottle in your collection")
                    .accessibilityHint("Opens the bottle")
            } else if !l.bottles.isEmpty {
                NavigationLink { LabelBottlesView(title: "\(l.brand) \(l.name)", category: l.category, bottles: l.bottles) } label: { block }
                    .accessibilityLabel("\(l.brand) \(l.name), \(l.bottles.count) bottles in your collection")
                    .accessibilityHint("Opens the list of your bottles")
            } else {
                block.accessibilityElement(children: .combine)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: Tastings

    private func sectionTitle(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Theme.ink).frame(height: 2)
            Text(text).font(.headline(20)).foregroundStyle(Theme.ink).padding(.top, 10)
        }
        .padding(.top, 18)
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private func tastings(_ l: LabelDetail) -> some View {
        if l.tastings.isEmpty {
            VStack(spacing: 4) {
                Text("No tastings yet").font(.headline(18)).foregroundStyle(Theme.ink)
                Text("Log one and it shows up here and in your history.").font(.inter(13)).foregroundStyle(Theme.muted)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        } else {
            ForEach(l.tastings.prefix(Self.shownTastings)) { tasting in
                TastingBlock(tasting: tasting)
                    .swipeToDelete { deletingTasting = tasting.id }
            }
            if l.tastings.count > Self.shownTastings {
                NavigationLink {
                    LabelTastingsList(label: l) { Task { await load() } }
                } label: {
                    Text("See all \(l.tastings.count) tastings")
                        .font(.inter(15, .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.ink, lineWidth: 1))
                }
                .padding(.top, 10)
            }
        }
    }

    // MARK: Not owned

    private var notOwned: some View {
        VStack(spacing: 10) {
            Text("Not in your collection").font(.inter(15, .semibold)).foregroundStyle(Theme.ink)
            Button { addingBottle = true } label: {
                Text("Add this bottle")
                    .font(.inter(16, .semibold))
                    .foregroundStyle(Theme.paper)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Theme.ink, in: RoundedRectangle(cornerRadius: 4))
            }
        }
        .padding(12)
        .overlay(Rectangle().strokeBorder(Theme.ink, style: StrokeStyle(lineWidth: 2, dash: [5, 4])))
        .padding(.top, 14)
    }

    // MARK: About

    private func about(_ l: LabelDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("About this label")
                .font(.inter(12, .semibold, relativeTo: .caption))
                .textCase(.uppercase)
                .tracking(0.8)
                .foregroundStyle(Theme.muted)
                .padding(.bottom, 4)
                .accessibilityAddTraits(.isHeader)
            fact("Age", l.ageStatement ?? l.ageYears.flatMap(Double.init).map { "\($0.formatted()) years" })
            fact("Size", "\(l.sizeMl) mL")
            fact("MSRP", l.msrp.map(Format.money))
            fact("Distilleries", l.distilleries.joined(separator: ", "))
            fact("Mashbill", l.mashbills.joined(separator: ", "))
            fact("Finishes", l.finishes.joined(separator: ", "))
            fact("Barcode", l.upc)
            if !l.releases.isEmpty {
                NavigationLink { LabelReleasesList(title: "\(l.brand) \(l.name)", releases: l.releases) } label: {
                    HStack {
                        Text("Releases").foregroundStyle(Theme.muted)
                        Spacer()
                        Text("\(l.releases.count) ›").foregroundStyle(Theme.ink)
                    }
                    .font(.inter(15))
                    .frame(minHeight: 40)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(Theme.ink.opacity(0.07), in: RoundedRectangle(cornerRadius: 6))
        .padding(.top, 20)
    }

    /// Hidden when there is nothing to say, so the panel only shows what is recorded.
    @ViewBuilder
    private func fact(_ title: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            VStack(spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text(title).foregroundStyle(Theme.muted)
                    Spacer(minLength: 12)
                    Text(value).foregroundStyle(Theme.ink).multilineTextAlignment(.trailing)
                }
                .font(.inter(15))
                .frame(minHeight: 40)
                Rectangle().fill(Theme.ink.opacity(0.15)).frame(height: 1)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func load() async {
        guard let api = session.api else { return }
        do {
            label = try await api.label(id: id)
            error = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One tasting on the label page: date, where it was, the flavors and what was written, with the score at the right.
struct TastingBlock: View {
    @Environment(Session.self) private var session
    let tasting: LabelTasting

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(Format.day(tasting.tastedOn)).font(.inter(15, .semibold)).foregroundStyle(Theme.ink).monospacedDigit()
                    if let pour = Format.pour(source: tasting.source, tastedAt: tasting.tastedAt) ?? ownedLabel {
                        Text(pour).font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted)
                    }
                    if let flavors = tasting.tags, !flavors.isEmpty {
                        Text(flavors.map(session.flavorName).joined(separator: ", "))
                            .font(.inter(13, .medium, relativeTo: .footnote)).foregroundStyle(Theme.ink)
                    }
                    ForEach(lines, id: \.0) { title, text in
                        Text("\(Text(title + " ").font(.inter(13, .medium)).foregroundStyle(Theme.muted))\(Text(text).font(.inter(13)))")
                            .foregroundStyle(Theme.ink)
                    }
                }
                Spacer(minLength: 4)
                TastingScore(rating: tasting.rating)
            }
            .padding(.vertical, 10)
            Rectangle().fill(Theme.ink.opacity(0.15)).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
    }

    private var ownedLabel: String? { tasting.source == TastingSource.owned.rawValue ? TastingSource.owned.title : nil }

    private var lines: [(String, String)] {
        [("Nose", tasting.nose), ("Palate", tasting.palate), ("Finish", tasting.finish), ("Overall", tasting.overall)]
            .compactMap { title, text in text.flatMap { $0.isEmpty ? nil : (title, $0) } }
    }
}

/// Every tasting of the label, newest first; tap one to edit it.
struct LabelTastingsList: View {
    let label: LabelDetail
    var onChanged: () -> Void
    @State private var editing: LabelTasting?
    @State private var deleting: Int?

    var body: some View {
        List(label.tastings) { tasting in
            Button { editing = tasting } label: { TastingBlock(tasting: tasting) }
                .buttonStyle(.plain)
                .accessibilityHint("Edits this tasting")
                .listRowBackground(Theme.paper)
                .listRowSeparator(.hidden)
                .swipeActions(edge: .trailing) {
                    Button("Delete", role: .destructive) { deleting = tasting.id }
                }
                .contextMenu { Button("Delete", systemImage: "trash", role: .destructive) { deleting = tasting.id } }
        }
        .listStyle(.plain)
        .background(Theme.paper)
        .navigationTitle("\(label.tastings.count) tastings")
        .navigationBarTitleDisplayMode(.inline)
        .confirmsTastingDeletion($deleting) { _ in onChanged() }
        .sheet(item: $editing) { tasting in
            NavigationStack {
                TastingFormView(
                    label: TastingLabel(label),
                    bottle: label.bottles.first { $0.id == tasting.bottleId }.map(TastingBottle.init),
                    existing: tasting
                ) {
                    editing = nil
                    onChanged()
                }
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editing = nil } } }
            }
        }
    }

}

/// Log a tasting of this label, from its page: pick which bottle if you have any of it, then fill in the form.
struct LogTastingForLabel: View {
    let label: LabelDetail
    var onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss

    private enum Step: Hashable { case form(LabelBottle?) }
    @State private var path: [Step] = []

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if label.bottles.isEmpty {
                    form(bottle: nil)
                } else {
                    BottleChoiceView(label: LabelOption(label)) { bottle, _ in path.append(.form(bottle)) }
                }
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .navigationDestination(for: Step.self) { step in
                if case .form(let bottle) = step { form(bottle: bottle) }
            }
        }
    }

    private func form(bottle: LabelBottle?) -> some View {
        TastingFormView(label: TastingLabel(label), bottle: bottle.map(TastingBottle.init)) { onSaved() }
    }
}

/// The bottles you have of a label. They open in the Collection's bottle page.
struct LabelBottlesView: View {
    let title: String
    let category: String
    let bottles: [LabelBottle]

    var body: some View {
        List(bottles) { bottle in
            NavigationLink { BottleDetailView(id: bottle.id) } label: {
                HStack(spacing: 12) {
                    LabelThumb(path: bottle.thumbPath, category: category, width: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(bottle.title).font(.inter(16, .medium)).foregroundStyle(Theme.ink)
                        Text([bottle.status.capitalized, bottle.dateAcquired.map(Format.day)].compactMap { $0 }.joined(separator: " · "))
                            .font(.inter(13)).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                    FillGauge(percent: bottle.fillPct, track: Theme.ink.opacity(0.15)).frame(width: 4, height: 32)
                }
                .frame(minHeight: 56)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(bottle.title), \(bottle.status), \(bottle.fillPct) percent full")
            }
            .listRowBackground(Theme.paper)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The known releases of a label.
struct LabelReleasesList: View {
    let title: String
    let releases: [LabelRelease]

    var body: some View {
        List(releases) { release in
            VStack(alignment: .leading, spacing: 2) {
                Text(release.name).font(.inter(16, .medium)).foregroundStyle(Theme.ink)
                let detail = [release.releaseYear.map(String.init), Format.proof(release.proof)].compactMap { $0 }.joined(separator: " · ")
                if !detail.isEmpty { Text(detail).font(.inter(13)).foregroundStyle(Theme.muted) }
            }
            .frame(minHeight: 44, alignment: .leading)
            .listRowBackground(Theme.paper)
            .accessibilityElement(children: .combine)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

extension LabelOption {
    /// A label read in full, as the pickers and the bottle form take one.
    init(_ detail: LabelDetail) {
        self.init(
            id: detail.id, name: detail.name, brand: detail.brand, category: detail.category, proof: detail.proof,
            upc: detail.upc, thumbPath: detail.photoThumbPath, wheel: detail.wheel
        )
    }
}

/// Asks before deleting a tasting, deletes it on the server, then tells the screen. One place for every list of tastings.
private struct DeleteTastingConfirmation: ViewModifier {
    @Environment(Session.self) private var session
    @Binding var pending: Int?
    let onDeleted: (Int) -> Void
    @State private var problem: String?

    func body(content: Content) -> some View {
        content
            .confirmSheet("Delete this tasting?", message: "This can't be undone.", confirm: "Delete tasting", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } })) {
                if let id = pending { delete(id) }
            }
            .alert("Couldn't delete", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(problem ?? "")
            }
    }

    private func delete(_ id: Int) {
        guard let api = session.api else { return }
        Task {
            do {
                try await api.deleteTasting(id: id)
                onDeleted(id)
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                problem = error.localizedDescription
            }
        }
    }
}

extension View {
    /// Confirms and performs the deletion of the tasting whose id is put in `pending`.
    func confirmsTastingDeletion(_ pending: Binding<Int?>, onDeleted: @escaping (Int) -> Void) -> some View {
        modifier(DeleteTastingConfirmation(pending: pending, onDeleted: onDeleted))
    }
}
