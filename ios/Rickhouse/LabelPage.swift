import Charts
import SwiftUI

/// One label, read rather than edited (spec 8.4). A label you own leads with your bottle: its fill and facts, then how
/// you score it over time, the latest tasting, the flavors you note, and the label's facts. A label you don't own leads
/// with your tastings, then a box offering the bottle, then the facts.
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
    @State private var fillingBottle: LabelBottle?

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
        .sheet(item: $fillingBottle) { bottle in
            UpdateFillSheet(bottle: bottle) {
                fillingBottle = nil
                Task { await load() }
            }
            .presentationDetents([.height(210)])
        }
    }

    private func content(_ l: LabelDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header(l)
                if l.bottles.isEmpty {
                    logButton.padding(.top, 12)
                    sectionTitle("Your tastings")
                    tastings(l)
                    notOwned
                } else {
                    yourBottles(l)
                    HStack(spacing: 8) {
                        logButton
                        if l.bottles.count == 1, let only = l.bottles.first {
                            outlineButton("Update fill") { fillingBottle = only }
                        } else {
                            outlineButton("Add another") { addingBottle = true }
                        }
                    }
                    .padding(.top, 12)
                    scoresSection(l)
                    flavorsSection(l)
                }
                about(l)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }

    private var logButton: some View {
        Button { loggingTasting = true } label: {
            Text("Log a tasting")
                .font(.inter(16, .semibold))
                .foregroundStyle(Theme.paper)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Theme.ink, in: RoundedRectangle(cornerRadius: 4))
        }
    }

    private func outlineButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.inter(16, .semibold))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, minHeight: 48)
                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.ink, lineWidth: 1))
        }
    }

    // MARK: Header

    /// The photo, brand, name and the line of category, proof and age. Your bottles, when you have any, sit under it.
    private func header(_ l: LabelDetail) -> some View {
        HStack(spacing: 12) {
            Button { viewingPhoto = true } label: {
                LabelThumb(path: l.photoThumbPath ?? l.photoPath, category: l.category, width: 54)
            }
            .buttonStyle(.plain)
            .disabled(l.photoPath == nil)
            .accessibilityLabel("Photo of \(l.brand) \(l.name)")
            .accessibilityHint(l.photoPath == nil ? "" : "Opens it full screen")
            AddPhotoTile(title: l.photoPath == nil ? "Add a label photo" : "Replace the label photo", size: CGSize(width: 54, height: 72)) { image in
                guard let api = session.api else { return }
                try await api.uploadLabelPhoto(expressionId: id, image: image)
                await load()
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(l.brand).font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted)
                Text(l.name).font(.headline(21)).foregroundStyle(Theme.ink)
                HStack(spacing: 5) {
                    Rectangle().fill(CategoryPalette.color(for: l.category))
                        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    Text([l.category, Format.proof(l.proof), age(l)].compactMap { $0 }.joined(separator: " · "))
                        .font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted)
                }
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 0)
        }
        .padding(.top, 4)
    }

    private func age(_ l: LabelDetail) -> String? {
        l.ageStatement ?? l.ageYears.flatMap(Double.init).map { "\($0.formatted()) yr" }
    }

    // MARK: Your bottles

    @ViewBuilder
    private func yourBottles(_ l: LabelDetail) -> some View {
        if l.bottles.count == 1, let bottle = l.bottles.first {
            NavigationLink { BottleDetailView(id: bottle.id) } label: { YourBottleBox(bottle: bottle) }
                .buttonStyle(.plain)
                .padding(.top, 12)
                .accessibilityHint("Opens the bottle")
        } else {
            sectionTitle("Your \(l.bottles.count) bottles")
            ForEach(Self.openFirst(l.bottles)) { bottle in
                NavigationLink { BottleDetailView(id: bottle.id) } label: { BottleLine(bottle: bottle) }
                    .buttonStyle(.plain)
            }
        }
    }

    /// Open bottles first, then sealed, then the rest; the server's newest-first order inside each.
    static func openFirst(_ bottles: [LabelBottle]) -> [LabelBottle] {
        func rank(_ b: LabelBottle) -> Int { b.isOpen ? 0 : b.status == "owned" ? 1 : 2 }
        return bottles.enumerated().sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }.map(\.element)
    }

    // MARK: Scores

    @ViewBuilder
    private func scoresSection(_ l: LabelDetail) -> some View {
        let scores = LabelScores(l.tastings)
        if let latest = l.tastings.first {
            VStack(alignment: .leading, spacing: 6) {
                if let average = scores.average {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(average.formatted()).font(.headline(26)).foregroundStyle(Theme.ink).monospacedDigit()
                        Text(scores.caption).font(.inter(13, .medium, relativeTo: .footnote)).foregroundStyle(Theme.muted)
                    }
                    .accessibilityElement(children: .combine)
                    if scores.showsTrend { ScoreLine(scores: scores) }
                }
                NavigationLink { LabelTastingsList(label: l) { Task { await load() } } } label: {
                    HStack(spacing: 8) {
                        Text(latestLine(latest)).font(.inter(14, relativeTo: .subheadline)).foregroundStyle(Theme.ink).lineLimit(1)
                        Spacer(minLength: 4)
                        Text("\(l.tastings.count) ›").font(.inter(14, .semibold, relativeTo: .subheadline)).foregroundStyle(Theme.ink)
                    }
                    .frame(minHeight: 44)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.ink.opacity(0.15)).frame(height: 1) }
                    .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink.opacity(0.15)).frame(height: 1) }
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens all \(l.tastings.count) tastings")
            }
            .padding(.top, 18)
        } else {
            Text("No tastings yet")
                .font(.inter(14, relativeTo: .subheadline)).foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.top, 12)
        }
    }

    /// "Latest Oct 3 · 8.5 · Caramel, orange peel"
    private func latestLine(_ t: LabelTasting) -> AttributedString {
        var lead = AttributedString("Latest ")
        lead.font = .inter(14, .semibold, relativeTo: .subheadline)
        let rest = [Format.day(t.tastedOn), Format.score(t.rating), t.tags.flatMap { $0.isEmpty ? nil : $0.prefix(2).map(session.flavorName).joined(separator: ", ") }]
            .compactMap { $0 }.joined(separator: " · ")
        return lead + AttributedString(rest)
    }

    @ViewBuilder
    private func flavorsSection(_ l: LabelDetail) -> some View {
        let scores = LabelScores(l.tastings)
        if scores.count >= LabelScores.chartMinimum, let top = scores.flavors.first {
            VStack(alignment: .leading, spacing: 6) {
                Text("Flavors you note").font(.headline(19)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
                ForEach(scores.flavors, id: \.key) { flavor in
                    HStack(spacing: 8) {
                        Text(session.flavorName(flavor.key)).font(.inter(14, relativeTo: .subheadline)).foregroundStyle(Theme.ink)
                            .frame(width: 110, alignment: .leading).lineLimit(1)
                        GeometryReader { geo in
                            Rectangle().fill(Theme.ink)
                                .frame(width: geo.size.width * CGFloat(flavor.count) / CGFloat(top.count), height: 8)
                                .frame(maxHeight: .infinity, alignment: .center)
                        }
                        .frame(height: 20)
                        Text(flavor.key == top.key ? "\(flavor.count) of \(scores.count)" : "\(flavor.count)")
                            .font(.inter(12, relativeTo: .caption)).foregroundStyle(Theme.muted).monospacedDigit()
                            .frame(minWidth: 40, alignment: .leading)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(session.flavorName(flavor.key)), in \(flavor.count) of \(scores.count) tastings")
                }
            }
            .padding(.top, 18)
        }
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
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button("Delete") { deleting = tasting.id }.tint(Theme.error)
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

extension LabelBottle {
    /// "Open", "Sealed", or what became of it: "Finished", "Sold".
    var statusName: String {
        if isOpen { return "Open" }
        switch status {
        case "owned": return "Sealed"
        case "killed": return "Finished"
        default: return status.capitalized
        }
    }
}

/// A fill bar: the level in ink inside an outline. No colour, so it reads the same on every spirit.
struct FillBar: View {
    let percent: Int

    var body: some View {
        GeometryReader { geo in
            Rectangle().fill(Theme.ink).frame(width: geo.size.width * CGFloat(max(0, min(100, percent))) / 100)
        }
        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
        .accessibilityHidden(true)
    }
}

/// Your one bottle of the label: its status, how much is left, and when and where you got it. Opens the bottle.
struct YourBottleBox: View {
    let bottle: LabelBottle

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(Text("Your bottle").font(.inter(15, .semibold))) \(Text("· \(bottle.statusName)").font(.inter(15, .medium)).foregroundStyle(Theme.muted))")
                Spacer()
                Text("Bottle ›").font(.inter(14, .semibold))
            }
            FillBar(percent: bottle.fillPct).frame(height: 10)
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 6) {
                GridRow {
                    fact("Left", FillState.of(bottle.fillPct).label)
                    fact("Opened", bottle.dateOpened.map(Format.day))
                }
                GridRow {
                    fact("Paid", bottle.pricePaid.map(Format.money))
                    fact("Store", bottle.store)
                }
            }
        }
        .foregroundStyle(Theme.ink)
        .padding(12)
        .overlay(Rectangle().strokeBorder(Theme.ink, lineWidth: 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func fact(_ title: String, _ value: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(.inter(11, .medium, relativeTo: .caption2)).foregroundStyle(Theme.muted)
            Text(value ?? "–").font(.inter(14, relativeTo: .subheadline)).foregroundStyle(value == nil ? Theme.muted : Theme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One of several bottles of the label: a fill bar and one line saying what tells it apart. Opens the bottle.
struct BottleLine: View {
    let bottle: LabelBottle

    var body: some View {
        HStack(spacing: 10) {
            FillBar(percent: bottle.fillPct).frame(width: 56, height: 8)
            Text("\(Text(bottle.statusName).font(.inter(14, .semibold))) \(Text(detail).font(.inter(14)))")
                .foregroundStyle(Theme.ink).lineLimit(1)
            Spacer(minLength: 4)
            Text("›").font(.inter(15, .semibold)).foregroundStyle(Theme.ink).accessibilityHidden(true)
        }
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.ink.opacity(0.15)).frame(height: 1) }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the bottle")
    }

    /// An open bottle: its level and since when. A sealed one: what it cost and where. Plus the pick or release, if any.
    private var detail: String {
        var parts: [String] = []
        if bottle.isOpen {
            parts.append(FillState.of(bottle.fillPct).label)
            if let opened = bottle.dateOpened { parts.append("since \(Format.monthYear(opened))") }
        } else {
            if let paid = bottle.pricePaid { parts.append(Format.money(paid)) }
            if let store = bottle.store { parts.append(store) }
        }
        if bottle.title != "Standard release" { parts.append(bottle.title) }
        return parts.isEmpty ? "" : "· " + parts.joined(separator: " · ")
    }
}

/// Every scored tasting over time, the average as a dashed rule, the latest point a little larger.
struct ScoreLine: View {
    let scores: LabelScores

    var body: some View {
        Chart {
            if let average = scores.average {
                RuleMark(y: .value("Average", average))
                    .foregroundStyle(Theme.ink.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
            ForEach(scores.points) { point in
                LineMark(x: .value("Tasted", point.date), y: .value("Score", point.rating))
                    .foregroundStyle(Theme.ink)
                    .lineStyle(StrokeStyle(lineWidth: 1.5))
                PointMark(x: .value("Tasted", point.date), y: .value("Score", point.rating))
                    .foregroundStyle(Theme.ink)
                    .symbolSize(point.id == scores.points.last?.id ? 60 : 28)
            }
        }
        .chartYScale(domain: yDomain)
        .chartXScale(range: .plotDimension(padding: 8))
        .chartYAxis { AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) }
        // Each month's label ends at its tick, so the last one isn't cut off at the plot's edge.
        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 3)) { _ in AxisValueLabel(format: .dateTime.month(.abbreviated), anchor: .topTrailing) } }
        .frame(height: 90)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Scores over time")
        .accessibilityValue(scores.points.map { "\($0.rating.formatted()) on \($0.date.formatted(date: .abbreviated, time: .omitted))" }.joined(separator: ", "))
    }

    /// A little room around the scores, kept inside 0 to 10, so the line isn't pressed flat against an edge.
    private var yDomain: ClosedRange<Double> {
        let low = max(0, ((scores.low ?? 0) - 1).rounded(.down))
        let high = min(10, ((scores.high ?? 10) + 1).rounded(.up))
        return low...max(high, low + 2)
    }
}

/// Update fill, from the label page: the bottle page's fill picker, saved the same way, in a short sheet.
struct UpdateFillSheet: View {
    @Environment(Session.self) private var session
    let bottle: LabelBottle
    var onDone: () -> Void

    @State private var percent: Int
    @State private var saving = false
    @State private var problem: String?

    init(bottle: LabelBottle, onDone: @escaping () -> Void) {
        self.bottle = bottle
        self.onDone = onDone
        _percent = State(initialValue: bottle.fillPct)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How much is left?").font(.headline(20)).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader)
            FillPicker(percent: percent, disabled: saving) { picked in Task { await save(picked) } }
            if let problem { ErrorText(problem) }
        }
        .padding(16)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.paper)
    }

    /// The server decides what else changes: below full opens a sealed bottle.
    private func save(_ picked: Int) async {
        guard let api = session.api, picked != bottle.fillPct else { onDone(); return }
        saving = true
        defer { saving = false }
        percent = picked
        do {
            _ = try await api.setFill(bottleId: bottle.id, to: picked)
            onDone()
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            percent = bottle.fillPct
            problem = error.localizedDescription
        }
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
