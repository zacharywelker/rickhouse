import SwiftUI

struct BottleDetailView: View {
    @Environment(Session.self) private var session
    let id: Int
    @State private var bottle: BottleDetail?
    @State private var error: String?

    var body: some View {
        Group {
            if let bottle {
                content(bottle)
            } else if let error {
                ContentUnavailableView("Couldn't load", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func content(_ b: BottleDetail) -> some View {
        List {
            if !b.images.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(b.images) { image in
                            AuthenticatedImage(path: image.path)
                                .frame(width: 220, height: 280)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            Section {
                Text(b.brand).font(.subheadline).foregroundStyle(.secondary)
                Text(b.name).font(.title2.bold())
                HStack {
                    FillGauge(percent: b.fillPct, track: Theme.ink.opacity(0.15)).frame(width: 4, height: 28)
                    Text("\(b.fillPct)% full" + (b.isOpen ? " · open" : ""))
                }
            }
            Section("Label") {
                row("Category", b.category)
                row("Proof", b.proof.flatMap(Double.init).map { $0.formatted() })
                row("Age", b.ageStatement)
                row("Size", "\(b.sizeMl) mL")
                row("Distilleries", b.distilleries.joined(separator: ", "))
                row("Mashbill", b.mashbills.joined(separator: ", "))
                row("Finishes", b.finishes.joined(separator: ", "))
            }
            Section("Bottle") {
                row("Status", b.status.capitalized)
                row("Batch", b.batch)
                row("Barrel", b.barrelNumber)
                row("Pick", b.pickName)
                row("Paid", b.pricePaid.map { "$" + $0 })
                row("MSRP", b.msrp.map { "$" + $0 })
                row("Store", b.store)
                row("Acquired", b.dateAcquired)
                row("Location", b.location)
                row("Notes", b.notes)
            }
            if !b.tastingNotes.isEmpty {
                Section("Tasting notes") {
                    ForEach(b.tastingNotes) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(note.tastedOn).font(.subheadline.bold())
                                Spacer()
                                if let rating = note.rating { Text("\(rating) / 10") }
                            }
                            if let text = note.overall ?? note.nose ?? note.palate { Text(text).font(.callout) }
                        }
                    }
                }
            }
        }
        .navigationTitle(b.name)
    }

    /// Hidden when there is nothing to say, so the sheet only shows what is recorded.
    @ViewBuilder
    private func row(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            LabeledContent(label, value: value)
        }
    }

    private func load() async {
        guard let api = session.api else { return }
        do {
            bottle = try await api.bottle(id: id)
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
