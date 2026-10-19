import SwiftUI

/// Ranking and audit (spec 7): every decided flight of every tournament, pooled. Ranking lists the bottles by comparable group; Audit says
/// where that ranking and your own 0 to 10 ratings disagree. Opened from the Tournaments list, a finished tournament, and a label's rank line.
struct RankingView: View {
    @Environment(Session.self) private var session
    @State private var model: RankingModel
    @State private var choosingCategory = false

    init(categoryId: Int? = nil) { _model = State(initialValue: RankingModel(categoryId: categoryId)) }

    var body: some View {
        content
            .background(Theme.paper)
            .navigationTitle("Ranking and audit")
            .navigationBarTitleDisplayMode(.inline)
            .footBar(model.foot)
            .optionSheet("Category", isPresented: $choosingCategory, options: model.categoryOptions,
                         selection: model.categoryId.map(String.init) ?? "") { id in
                Task { await model.choose(categoryId: Int(id)) }
            }
            .task {
                model.api = { session.api }
                model.signOut = { session.signOut() }
                await model.load()
            }
            .refreshable { await model.load() }
    }

    @ViewBuilder private var content: some View {
        if !model.hasLoaded {
            if let error = model.loadError {
                ContentUnavailableView {
                    Label("Couldn't load", systemImage: "wifi.slash")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            List {
                Section {
                    Text(model.subtitle).font(.inter(14)).foregroundStyle(Theme.muted)
                    Picker("View", selection: $model.tab) {
                        ForEach(RankingModel.Tab.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    PickerRow(title: "Category", value: model.categoryName) { choosingCategory = true }
                }
                .listRowBackground(Color.clear)
                if model.empty == .noFlights {
                    Section {
                        Text(model.noFlightsText).font(.inter(16)).foregroundStyle(Theme.ink)
                        NavigationLink("Tournaments") { TournamentsView() }.frame(minHeight: 44)
                    }
                } else if model.tab == .ranking {
                    ForEach(Array(model.sections.enumerated()), id: \.offset) { _, section in RankingSectionView(section: section) }
                } else {
                    AuditSectionView(lines: model.auditLines, empty: model.empty, note: model.auditNote)
                }
            }
            .scrollContentBackground(.hidden)
            .font(.inter(16))
        }
    }
}
