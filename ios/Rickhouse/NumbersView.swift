import SwiftUI

/// What `GET /api/v1/numbers` answers: the web Numbers page's findings, in the account's currency.
struct NumbersAnswer: Decodable {
    let empty: Bool
    let lead: NumbersFinding?
    let chapters: [NumbersChapter]
}

struct NumbersChapter: Decodable, Identifiable {
    let id: String
    let number: String
    let title: String
    /// "Based on 31 of 41 bottles…", when the chapter could not count everything.
    let coverage: String?
    let thin: Bool
    let findings: [NumbersFinding]
}

struct NumbersFinding: Decodable, Identifiable {
    let id: String
    let figure: String
    let sentence: String
    /// The web grid's filter query for the bottles behind the figure; nil when it names one bottle.
    let bottles: String?
    let bottleId: Int?

    var target: NumbersTarget? {
        if let bottleId { return .bottle(bottleId) }
        return bottles.map { .bottles(query: $0, title: "\(figure) \(sentence)") }
    }
}

enum NumbersTarget: Hashable {
    case bottle(Int)
    case bottles(query: String, title: String)
}

/// The Numbers tab: one finding written as a sentence, then the chapters, each a list of findings. A finding opens the
/// bottles it counts. Figures and sentences come from the server so the phone and the web page always agree.
struct NumbersView: View {
    @Environment(Session.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var answer: NumbersAnswer?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let answer {
                    if answer.empty { empty } else { content(answer) }
                } else if let error {
                    ContentUnavailableView {
                        Label("Couldn't load Numbers", systemImage: "wifi.slash")
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
            .navigationTitle("Numbers")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: NumbersTarget.self) { target in
                switch target {
                case .bottle(let id): BottleDetailView(id: id)
                case .bottles(let query, let title): FilteredBottlesView(title: title, filter: query)
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private var empty: some View {
        ContentUnavailableView("Nothing to count yet", systemImage: "chart.bar",
                               description: Text("Add a few bottles and your numbers appear here."))
    }

    private func content(_ answer: NumbersAnswer) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                if let lead = answer.lead { leadView(lead) }
                ForEach(answer.chapters.filter { !$0.findings.isEmpty }) { chapter(chapter: $0) }
            }
            .padding(16)
        }
    }

    private func leadView(_ lead: NumbersFinding) -> some View {
        let text = Text("\(lead.figure) ").font(.headline(34)).monospacedDigit() + Text(lead.sentence).font(.headline(27))
        return Group {
            if let target = lead.target {
                NavigationLink(value: target) {
                    VStack(alignment: .leading, spacing: 8) {
                        text.foregroundStyle(Theme.ink).multilineTextAlignment(.leading)
                        Text("See these bottles").font(.inter(15, .medium)).foregroundStyle(Theme.ink).underline()
                    }
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityHint("Opens the bottles behind this")
            } else {
                text.foregroundStyle(Theme.ink)
            }
        }
    }

    private func chapter(chapter: NumbersChapter) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(chapter.number)  \(chapter.title)")
                .font(.inter(20, .semibold, relativeTo: .title3))
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 8)
            Rectangle().fill(Theme.ink).frame(height: 2)
            ForEach(chapter.findings) { finding in
                row(finding)
                Divider()
            }
            if let coverage = chapter.coverage {
                Text(coverage).font(.inter(13, relativeTo: .footnote)).foregroundStyle(Theme.muted).padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private func row(_ finding: NumbersFinding) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 16))
        let body = layout {
            Text(finding.figure)
                .font(.inter(24, .semibold, relativeTo: .title2)).monospacedDigit()
                .frame(minWidth: typeSize.isAccessibilitySize ? nil : 88, alignment: .leading)
            Text(finding.sentence).font(.inter(16)).multilineTextAlignment(.leading)
            if finding.target != nil && !typeSize.isAccessibilitySize {
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Theme.muted).accessibilityHidden(true)
            }
        }
        .foregroundStyle(Theme.ink)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        if let target = finding.target {
            NavigationLink(value: target) { body }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityHint("Opens the bottles behind this")
        } else {
            body.accessibilityElement(children: .combine)
        }
    }

    private func load() async {
        guard let api = session.api else { return }
        do {
            answer = try await api.numbers()
            error = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            // A reload that fails keeps what is on screen.
            if answer == nil { self.error = error.localizedDescription }
        }
    }
}

/// The bottles a Numbers finding counts: the collection under the finding's own filter, newest page last.
struct FilteredBottlesView: View {
    @Environment(Session.self) private var session
    let title: String
    let filter: String
    @State private var bottles: [BottleSummary] = []
    @State private var total = 0
    @State private var page = 0
    @State private var pageCount = 1
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        List {
            if loaded {
                VStack(alignment: .leading, spacing: 4) {
                    Text(total == 1 ? "1 bottle" : "\(total) bottles").font(.headline())
                    Text(title).font(.inter(15, relativeTo: .subheadline)).foregroundStyle(Theme.muted)
                }
                .listRowBackground(Theme.paper)
            }
            if let error { ErrorText(error).listRowBackground(Theme.paper) }
            ForEach(bottles) { bottle in
                NavigationLink(value: NumbersTarget.bottle(bottle.id)) { BottleRow(bottle: bottle) }
                    .listRowBackground(Theme.paper)
                    .task { if bottle.id == bottles.last?.id { await more() } }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle("Bottles")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if !loaded && error == nil { ProgressView() } }
        .task { if page == 0 { await more() } }
    }

    private func more() async {
        guard let api = session.api, page < pageCount else { return }
        do {
            let next = try await api.bottles(filter: filter, page: page + 1)
            bottles += next.bottles
            total = next.total
            page = next.page
            pageCount = next.pageCount
            loaded = true
            error = nil
        } catch APIError.unauthorized {
            session.signOut()
        } catch {
            self.error = error.localizedDescription
            loaded = true
        }
    }
}
