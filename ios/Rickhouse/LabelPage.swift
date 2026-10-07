import SwiftUI

/// One label, read rather than edited: its photo and specs, its known releases,
/// the bottles you have of it and the tastings on them.
struct LabelPage: View {
    @Environment(Session.self) private var session
    let id: Int
    @State private var label: LabelDetail?
    @State private var error: String?
    /// The tasting being edited, in a sheet.
    @State private var editing: LabelTasting?

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
        .sheet(item: $editing) { tasting in
            if let label {
                NavigationStack {
                    TastingFormView(
                        label: TastingLabel(label),
                        bottle: label.bottles.first { $0.id == tasting.bottleId }.map(TastingBottle.init),
                        existing: tasting
                    ) {
                        editing = nil
                        Task { await load() }
                    }
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { editing = nil } } }
                }
            }
        }
    }

    private func content(_ l: LabelDetail) -> some View {
        let plate = CategoryPalette.color(for: l.category)
        return List {
            if let photo = l.photoPath {
                // The label's own photo in the same frame as the gallery: the whole picture, on the category's colour.
                Color.clear
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
                    .overlay { AuthenticatedImage(path: photo, contentMode: .fit, background: plate).padding(6) }
                    .clipped()
                    .frame(width: 210)
                    .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                    .accessibilityLabel("Label photo")
            }
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(l.brand).font(.inter(13, .medium, relativeTo: .subheadline)).foregroundStyle(Theme.muted)
                    Text(l.name).font(.headline(26)).foregroundStyle(Theme.ink)
                    HStack(spacing: 5) {
                        Rectangle().fill(plate)
                            .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                            .frame(width: 8, height: 8)
                            .accessibilityHidden(true)
                        Text(l.category).font(.inter(13, .medium, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                    }
                }
                .padding(.vertical, 4)
            }
            Section("Specs") {
                row("Proof", Format.proof(l.proof)?.replacingOccurrences(of: " proof", with: ""))
                row("Age", l.ageStatement ?? l.ageYears.flatMap(Double.init).map { "\($0.formatted()) years" })
                row("Size", "\(l.sizeMl) mL")
                row("MSRP", l.msrp.map(Format.money))
                row("Distilleries", l.distilleries.joined(separator: ", "))
                row("Mashbill", l.mashbills.joined(separator: ", "))
                row("Finishes", l.finishes.joined(separator: ", "))
                row("Barcode", l.upc)
            }
            if !l.releases.isEmpty {
                Section("Releases") {
                    ForEach(l.releases) { release in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(release.name).font(.inter(16, .medium))
                            let detail = [release.releaseYear.map(String.init), Format.proof(release.proof)].compactMap { $0 }.joined(separator: " · ")
                            if !detail.isEmpty { Text(detail).font(.inter(13)).foregroundStyle(Theme.muted) }
                        }
                    }
                }
            }
            Section("Your bottles") {
                if l.bottles.isEmpty {
                    Text("You don't have a bottle of this label.").font(.inter(14)).foregroundStyle(Theme.muted)
                }
                ForEach(l.bottles) { bottle in
                    NavigationLink { BottleDetailView(id: bottle.id) } label: { bottleRow(bottle, plate: plate) }
                }
            }
            if !l.tastings.isEmpty {
                Section("Tastings") {
                    ForEach(l.tastings) { tasting in
                        Button { editing = tasting } label: { tastingRow(tasting) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .font(.inter(16))
        .scrollContentBackground(.hidden)
        .navigationTitle(l.name)
    }

    /// Hidden when there is nothing to say, so the page only shows what is recorded.
    @ViewBuilder
    private func row(_ title: String, _ value: String?) -> some View {
        if let value, !value.isEmpty { LabeledContent(title, value: value) }
    }

    private func bottleRow(_ bottle: LabelBottle, plate: Color) -> some View {
        HStack(spacing: 12) {
            AuthenticatedImage(path: bottle.thumbPath, contentMode: .fit, background: plate)
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            VStack(alignment: .leading, spacing: 2) {
                Text(bottle.title).font(.inter(16, .medium))
                Text([bottle.status.capitalized, bottle.dateAcquired.map(Format.day)].compactMap { $0 }.joined(separator: " · "))
                    .font(.inter(13)).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
            FillGauge(percent: bottle.fillPct, track: Theme.ink.opacity(0.15)).frame(width: 4, height: 32)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(bottle.title), \(bottle.status), \(bottle.fillPct) percent full")
    }

    private func tastingRow(_ tasting: LabelTasting) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(Format.day(tasting.tastedOn)).font(.inter(15, .semibold)).monospacedDigit()
                Spacer()
                if let rating = Format.rating(tasting.rating) { Text(rating).font(.inter(15, .medium)).monospacedDigit() }
            }
            if let pour = Format.pour(source: tasting.source, tastedAt: tasting.tastedAt) {
                Text(pour).font(.inter(13)).foregroundStyle(Theme.muted)
            }
            if let flavors = tasting.tags, !flavors.isEmpty {
                Text(flavors.map(session.flavorName).joined(separator: ", ")).font(.inter(14, .medium)).foregroundStyle(Theme.ink)
            }
            ForEach(lines(of: tasting), id: \.0) { title, text in
                Text("\(Text(title + " ").font(.inter(14, .medium)).foregroundStyle(Theme.muted))\(Text(text).font(.inter(14)))")
                    .foregroundStyle(Theme.ink)
            }
        }
    }

    private func lines(of tasting: LabelTasting) -> [(String, String)] {
        [("Nose", tasting.nose), ("Palate", tasting.palate), ("Finish", tasting.finish), ("Overall", tasting.overall)]
            .compactMap { title, text in text.flatMap { $0.isEmpty ? nil : (title, $0) } }
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
