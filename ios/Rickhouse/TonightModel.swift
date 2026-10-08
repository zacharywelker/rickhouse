import Observation
import SwiftUI

/// The choices and draws of one go at What to drink tonight. The server decides what each step offers and how a bottle is
/// drawn (docs/superpowers/specs/2026-10-08-tonight-design.md); this holds what the person has chosen and what has been
/// shown, so "Not this one" never repeats.
@MainActor
@Observable
final class TonightModel {
    var categories: Set<Int> = []
    /// Include sealed bottles. Off by default: pouring a sealed bottle opens it.
    var sealed = false
    var bands: Set<String> = []
    var flavors: Set<String> = []

    private(set) var options: TonightOptions?
    private(set) var loadError: String?
    private(set) var pick: TonightPick?
    /// A draw has finished. With `pick` nil it found nothing left that fits.
    private(set) var drawn = false
    private(set) var shown: [Int] = []
    private var lastRequest: TonightPickRequest?

    // MARK: Steps

    /// Whether the proof step is asked at all.
    var asksProof: Bool { options?.proof.applies == true }
    /// Flavors when the account has enough tastings of the chosen spirits; otherwise "Time to open a new bottle?".
    var asksFlavors: Bool { options?.flavors.enabled == true }
    var stepCount: Int { 1 + (asksProof ? 1 : 0) + 1 }

    /// 1 for Spirit; the flavors step or its fallback is the last.
    func stepNumber(of step: TonightStep) -> Int {
        switch step {
        case .proof: 2
        case .flavors, .fallback: stepCount
        default: 1
        }
    }

    // MARK: Choices

    func toggle(category id: Int) {
        if categories.contains(id) { categories.remove(id) } else { categories.insert(id) }
        // Proof and flavors depend on the spirits, so what was chosen for the old set no longer means anything.
        bands = []
        flavors = []
    }

    func toggle(band key: String) {
        if bands.contains(key) { bands.remove(key) } else { bands.insert(key) }
    }

    func toggle(flavor key: String) {
        if flavors.contains(key) { flavors.remove(key) } else { flavors.insert(key) }
    }

    /// Turning sealed bottles on or off changes the counts everywhere, and spirits that had only sealed bottles.
    func setSealed(_ on: Bool, api: APIClient?) async {
        sealed = on
        await loadOptions(api: api)
    }

    func loadOptions(api: APIClient?) async {
        guard let api else { return }
        do {
            let fresh = try await api.tonightOptions(categories: categories, sealed: sealed)
            options = fresh
            loadError = nil
            // A spirit with nothing left to draw (only sealed ones, switch now off) can't stay chosen.
            let live = Set(fresh.spirits.filter { $0.open + (sealed ? $0.sealed : 0) > 0 }.map(\.categoryId))
            let kept = categories.intersection(live)
            if kept != categories { categories = kept; await loadOptions(api: api) }
        } catch APIError.unauthorized {
            loadError = APIError.unauthorized.localizedDescription
        } catch {
            loadError = error.localizedDescription
        }
    }

    // MARK: Drawing

    func flowRequest(only: String? = nil) -> TonightPickRequest {
        TonightPickRequest(
            mode: TonightPickRequest.flow,
            only: only,
            categories: categories.sorted(),
            sealed: sealed,
            bands: asksProof ? bands.sorted() : [],
            flavors: only == nil && asksFlavors ? flavors.sorted() : [],
            exclude: shown
        )
    }

    func rouletteRequest() -> TonightPickRequest {
        TonightPickRequest(mode: TonightPickRequest.roulette, only: nil, categories: [], sealed: sealed, bands: [], flavors: [], exclude: shown)
    }

    /// Draws with a fresh request and remembers it, so `drawAgain` repeats the same rules.
    func draw(_ request: TonightPickRequest, api: APIClient) async throws {
        lastRequest = request
        try await run(request, api: api)
    }

    /// "Not this one": the same rules, without any bottle already shown.
    func drawAgain(api: APIClient) async throws {
        guard var request = lastRequest else { return }
        request.exclude = shown
        try await run(request, api: api)
    }

    private func run(_ request: TonightPickRequest, api: APIClient) async throws {
        let result = try await api.tonightPick(request)
        pick = result
        drawn = true
        if let result { shown.append(result.bottle.id) }
    }

    /// A fresh start for the next go.
    func startOver() {
        pick = nil
        drawn = false
        shown = []
        lastRequest = nil
    }
}

/// Where the sheet's navigation can be.
enum TonightStep: Hashable {
    case proof, flavors, fallback, result
    case bottle(Int)
}
