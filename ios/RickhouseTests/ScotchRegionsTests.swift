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

    // MARK: A distillery's region flows onto the label

    func testAddingKeepsWhatIsThereAndAppendsTheRestOnceInTheServersSpelling() {
        XCTAssertEqual(ScotchRegions.adding(["islay", "Speyside"], to: "Islay"), "Islay, Speyside")
        XCTAssertEqual(ScotchRegions.adding(["Highland"], to: ""), "Highland")
        XCTAssertEqual(ScotchRegions.adding([], to: "Islay"), "Islay")
    }

    func testALookupItemReadsItsRegionAndAnOlderServerHasNone() throws {
        let with = try JSONDecoder().decode(LookupItem.self, from: Data(#"{"id":1,"name":"Ardbeg","detail":"Scotland","region":"Islay"}"#.utf8))
        XCTAssertEqual(with.region, "Islay")
        let without = try JSONDecoder().decode(LookupItem.self, from: Data(#"{"id":2,"name":"Maker's Mark","detail":null}"#.utf8))
        XCTAssertNil(without.region)
    }

    private func ardbeg(_ id: Int = 1) -> LookupItem { LookupItem(id: id, name: "Ardbeg", region: "Islay") }
    private func glenfiddich(_ id: Int = 2) -> LookupItem { LookupItem(id: id, name: "Glenfiddich", region: "Speyside") }

    func testLinkingADistilleryToAScotchLabelAddsItsRegionAfterTheOnesThere() throws {
        var draft = LabelDraft(try label(["regions": ["Islay"]]))
        draft.setList(.distilleries, to: [ardbeg(), glenfiddich(), LookupItem(id: 3, name: "Maker's Mark")], bringingRegions: true)
        XCTAssertEqual(draft[.regions].text, "Islay, Speyside", "Islay was already there, a distillery with no region adds nothing")
        XCTAssertEqual(draft.patch()["regions"] as? [String], ["Islay", "Speyside"])
    }

    func testAnyOtherKindOfLabelKeepsItsRegionsAsTheyWere() throws {
        var draft = LabelDraft(try label())
        draft.setList(.distilleries, to: [ardbeg()], bringingRegions: false)
        XCTAssertEqual(draft[.regions].text, "")
        XCTAssertNil(draft.patch()["regions"])
    }

    func testOnlyADistilleryJustAddedBringsItsRegion() throws {
        var draft = LabelDraft(try label())
        draft.setList(.distilleries, to: [ardbeg()], bringingRegions: false)
        draft[.regions].text = ""                                   // a region taken off by hand
        draft.setList(.distilleries, to: [ardbeg()], bringingRegions: true)   // the same distillery picked again
        XCTAssertEqual(draft[.regions].text, "", "it was already on the label, so it stays off")
    }

    func testTakingADistilleryOffLeavesTheRegions() throws {
        var draft = LabelDraft(try label(["regions": ["Speyside"]]))
        draft.setList(.distilleries, to: [glenfiddich()], bringingRegions: true)
        draft.remove(.distilleries, id: 2)
        XCTAssertEqual(draft[.regions].text, "Speyside")
    }

    func testOtherListsNeverTouchRegions() throws {
        var draft = LabelDraft(try label())
        draft.setList(.finishes, to: [LookupItem(id: 9, name: "Port", region: "Islay")], bringingRegions: true)
        XCTAssertEqual(draft[.regions].text, "")
    }
}
