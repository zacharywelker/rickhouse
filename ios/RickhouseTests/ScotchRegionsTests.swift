import XCTest
@testable import Rickhouse

final class ScotchRegionsTests: XCTestCase {
    private func label(_ overrides: [String: Any] = [:]) throws -> LabelDetail {
        var json: [String: Any] = [
            "id": 10, "brandId": 1, "categoryId": 3, "brand": "Laphroaig", "name": "10", "category": "Single Malt Scotch",
            "proof": "86", "sizeMl": 750, "distilleries": [], "finishes": [], "mashbills": [], "releases": [], "bottles": [], "tastings": [],
        ]
        json.merge(overrides) { _, new in new }
        return try JSONDecoder().decode(LabelDetail.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testTheListIsTheServersSix() {
        XCTAssertEqual(ScotchRegions.all, ["Speyside", "Highland", "Lowland", "Islay", "Campbeltown", "Islands"])
        XCTAssertEqual(DistilleryDraft.scotchRegions, ScotchRegions.all)
    }

    func testTextBecomesAListInOrderOnceEachInTheServersSpelling() {
        XCTAssertEqual(ScotchRegions.list(" islay ,Speyside, ISLAY,, "), ["Islay", "Speyside"])
        XCTAssertEqual(ScotchRegions.list(""), [])
        XCTAssertEqual(ScotchRegions.list("Atlantis"), ["Atlantis"], "what isn't known is kept as typed, for the server to refuse")
    }

    func testTogglingAddsAtTheEndOrTakesOffWhateverTheCase() {
        XCTAssertEqual(ScotchRegions.toggled("Islay", in: ""), "Islay")
        XCTAssertEqual(ScotchRegions.toggled("Speyside", in: "Islay"), "Islay, Speyside")
        XCTAssertEqual(ScotchRegions.toggled("Islay", in: "Islay, Speyside"), "Speyside")
        XCTAssertEqual(ScotchRegions.toggled("islay", in: "Islay"), "")
    }

    func testOnlyScotchShowsRegions() {
        func rules(_ kind: String?) -> LabelRules {
            LabelRules(category: CategoryOption(id: 1, name: "X", parent: nil, group: "whiskey", kind: kind))
        }
        XCTAssertTrue(rules("scotch").showsRegions)
        XCTAssertFalse(rules("american").showsRegions)
        XCTAssertFalse(rules(nil).showsRegions)
    }

    func testALabelOpensWithItsRegionsAndAnOldServerMeansNone() throws {
        XCTAssertEqual(LabelDraft(try label(["regions": ["Islay", "Speyside"]]))[.regions].text, "Islay, Speyside")
        XCTAssertEqual(LabelDraft(try label())[.regions].text, "")
        XCTAssertFalse(LabelDraft(try label()).isDirty)
    }

    func testNothingChangedSendsNoRegions() throws {
        XCTAssertNil(LabelDraft(try label(["regions": ["Islay"]])).patch()["regions"])
    }

    func testChoosingRegionsSendsAListInOrder() throws {
        var draft = LabelDraft(try label(["regions": ["Islay"]]))
        draft[.regions].text = ScotchRegions.toggled("Speyside", in: draft[.regions].text)
        XCTAssertTrue(draft.isDirty)
        XCTAssertEqual(draft.patch()["regions"] as? [String], ["Islay", "Speyside"])
    }

    func testClearingThemSendsNullAndUndoPutsThemBack() throws {
        var draft = LabelDraft(try label(["regions": ["Highland", "Islands"]]))
        draft[.regions].text = ""
        XCTAssertTrue(draft.patch()["regions"] is NSNull)
        XCTAssertEqual(draft.undoPatch()["regions"] as? [String], ["Highland", "Islands"])
    }

    func testRegionsOnALabelThatHadNoneUndoToNull() throws {
        var draft = LabelDraft(try label())
        draft[.regions].text = "Lowland"
        XCTAssertEqual(draft.patch()["regions"] as? [String], ["Lowland"])
        XCTAssertTrue(draft.undoPatch()["regions"] is NSNull)
    }
}
