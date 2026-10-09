import SwiftUI

/// What the merge review is open for: the label that goes away and the one it merges into, read fresh from the server.
struct MergeSetup: Identifiable {
    let id = UUID()
    let mine: LabelDetail
    let theirs: LabelDetail
}

/// Merging a label into another (docs/superpowers/specs/2026-10-08-edit-facts-design.md, section 4): what moves, the facts
/// that differ (the label merged into wins unless you tap yours), and a last question, because it cannot be undone.
struct MergeReview: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    let plan: MergePlan
    var onMerged: (MergeAnswer) -> Void

    /// Facts to keep from the label that goes away. Empty means every fact is the surviving label's.
    @State private var keepMine: Set<MergeFact> = []
    @State private var confirming = false
    @State private var merging = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(plan.mine.name) becomes \(plan.theirsTitle)").font(.inter(15, .semibold))
                        Text(plan.summary).font(.inter(14))
                    }
                    .foregroundStyle(Theme.paper)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 6)
                    .listRowBackground(Theme.ink)
                    .accessibilityElement(children: .combine)
                }

                if plan.rows.isEmpty {
                    Section { Text("The two labels say the same about everything, so nothing needs choosing.").foregroundStyle(Theme.muted) }
                } else {
                    Section {
                        ForEach(plan.rows) { row in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(row.fact.title).font(.inter(14, .medium)).foregroundStyle(Theme.muted)
                                HStack(spacing: 8) {
                                    choice(row.theirs, caption: plan.theirs.name, picked: !keepMine.contains(row.fact)) { keepMine.remove(row.fact) }
                                    choice(row.mine, caption: plan.mine.name, picked: keepMine.contains(row.fact)) { keepMine.insert(row.fact) }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    } header: {
                        Text("Facts that differ")
                    } footer: {
                        Text("\(plan.theirs.name) wins unless you tap the other side. Other changes you have not saved on this label are not part of the merge.")
                    }
                }

                if let error { Section { ErrorText(error) } }

                Section {
                    Button { confirming = true } label: {
                        Text(merging ? "Merging…" : "Merge labels")
                            .font(.inter(16, .semibold))
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .disabled(merging)
                    .foregroundStyle(Theme.paper)
                    .listRowBackground(Theme.ink)
                } footer: {
                    Text("This cannot be undone.").frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle("Merge labels")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(merging) } }
            .confirmationDialog("Merge \(plan.mine.name) into \(plan.theirsTitle)?", isPresented: $confirming, titleVisibility: .visible) {
                Button("Merge labels", role: .destructive, action: merge)
                Button("Keep them separate", role: .cancel) {}
            } message: {
                Text("\(plan.summary) This cannot be undone.")
            }
        }
        .interactiveDismissDisabled(merging)
    }

    /// One side of a fact: its value, and which label it is from. The picked side is filled.
    private func choice(_ value: String, caption: String, picked: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.inter(15, .semibold)).lineLimit(2).multilineTextAlignment(.leading)
                Text(caption).font(.inter(11, relativeTo: .caption2)).lineLimit(1).opacity(0.85)
            }
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .padding(.horizontal, 10)
            .foregroundStyle(picked ? Theme.paper : Theme.ink)
            .background(picked ? Theme.ink : Color.clear, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Theme.ink, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(value), from \(caption)")
        .accessibilityAddTraits(picked ? .isSelected : [])
    }

    private func merge() {
        guard let api = session.api, !merging else { return }
        merging = true
        error = nil
        Task {
            defer { merging = false }
            do {
                let answer = try await api.mergeLabel(id: plan.mine.id, into: plan.theirs.id, keepMine: MergePlan.keepMine(keepMine))
                onMerged(answer)
            } catch APIError.unauthorized {
                session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// A short message after something that cannot be undone, with nothing to press.
struct NoticeBar: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.inter(15, .medium))
            .foregroundStyle(Theme.paper)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .accessibilityAddTraits(.updatesFrequently)
    }
}
