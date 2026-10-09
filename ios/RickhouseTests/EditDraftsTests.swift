import XCTest
@testable import Rickhouse

final class EditDraftsTests: XCTestCase {
    private func bottle(_ overrides: [String: Any] = [:]) throws -> BottleDetail {
        var json: [String: Any] = [
            "id": 5, "expressionId": 10, "brand": "Wild Turkey", "name": "Rare Breed", "category": "Bourbon",
            "status": "open", "isOpen": true, "isFavorite": false, "fillPct": 60, "sizeMl": 750,
            "pricePaid": "49.99", "dateAcquired": "2026-08-30", "dateOpened": "2026-09-14",
            "distilleries": [], "finishes": [], "mashbills": [], "images": [], "tastingNotes": [],
        ]
        json.merge(overrides) { _, new in new }
        return try JSONDecoder().decode(BottleDetail.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func label(_ overrides: [String: Any] = [:]) throws -> LabelDetail {
        var json: [String: Any] = [
            "id": 10, "brandId": 1, "categoryId": 3, "brand": "Wild Turkey", "name": "Rare Breed", "category": "Bourbon",
            "proof": "116.80", "sizeMl": 750, "msrp": "49.99", "distilleries": [], "finishes": [], "mashbills": [],
            "releases": [], "bottles": [], "tastings": [],
        ]
        json.merge(overrides) { _, new in new }
        return try JSONDecoder().decode(LabelDetail.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func same(_ a: [String: Any], _ b: [String: Any], file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(NSDictionary(dictionary: a), NSDictionary(dictionary: b), file: file, line: line)
    }

    // MARK: Bottle

    func testNothingChangedSendsNothing() throws {
        let draft = BottleDraft(try bottle())
        XCTAssertFalse(draft.isDirty)
        XCTAssertTrue(draft.patch().isEmpty)
    }

    func testOnlyChangedFactsAreSentAndAClearedOneIsNull() throws {
        var draft = BottleDraft(try bottle(["location": "Bar, shelf 2"]))
        draft[.paid].text = " 54.99 "
        draft[.location].text = ""
        same(draft.patch(), ["pricePaid": "54.99", "location": NSNull()])
    }

    func testRevertingAFieldPutsItBack() throws {
        var draft = BottleDraft(try bottle())
        draft[.paid].text = "54.99"
        XCTAssertTrue(draft[.paid].changed)
        draft[.paid].revert()
        XCTAssertFalse(draft[.paid].changed)
        XCTAssertFalse(draft.isDirty)
    }

    func testUndoSendsTheOldValues() throws {
        var draft = BottleDraft(try bottle(["location": "Bar"]))
        draft[.paid].text = "54.99"
        draft[.location].text = ""
        same(draft.undoPatch(), ["pricePaid": "49.99", "location": "Bar"])
    }

    func testAFactThatWasEmptyUndoesToNull() throws {
        var draft = BottleDraft(try bottle())
        draft[.batch].text = "B24-03"
        same(draft.undoPatch(), ["batch": NSNull()])
    }

    func testBatchAndYearOfABottleOnAReleaseAreNotEditable() throws {
        var draft = BottleDraft(try bottle(["releaseId": 4, "batch": "2024", "releaseYear": 2024]))
        draft[.batch].text = "X"
        draft[.releaseYear].text = "1999"
        XCTAssertFalse(draft.isDirty)
        XCTAssertTrue(draft.patch().isEmpty)
    }

    func testClearingOpenedOnAnOpenBottleNeedsAnAnswer() throws {
        var draft = BottleDraft(try bottle())
        draft[.opened].text = ""
        XCTAssertTrue(draft.clearsOpened)
        same(draft.patch(), ["dateOpened": NSNull()])
        same(draft.patch(choice: .keepOpen), ["dateOpened": NSNull(), "ifOpenedCleared": "keep_open"])
        same(draft.patch(choice: .seal), ["dateOpened": NSNull(), "ifOpenedCleared": "seal"])
    }

    func testChangingTheOpenedDateIsNotAClear() throws {
        var draft = BottleDraft(try bottle())
        draft[.opened].text = "2026-09-01"
        XCTAssertFalse(draft.clearsOpened)
        same(draft.patch(), ["dateOpened": "2026-09-01"])
    }

    func testClearingOpenedOnASealedBottleIsNothingToAskAbout() throws {
        var draft = BottleDraft(try bottle(["isOpen": false, "status": "owned", "fillPct": 100, "dateOpened": NSNull()]))
        draft[.opened].text = ""
        XCTAssertFalse(draft[.opened].changed)
        XCTAssertFalse(draft.clearsOpened)
    }

    func testUndoingASealRestoresTheLevelAndTheDate() throws {
        var draft = BottleDraft(try bottle())
        draft[.opened].text = ""
        same(draft.undoPatch(choice: .seal), ["dateOpened": "2026-09-14", "fillPct": 60])
    }

    func testUndoingKeepOpenRestoresTheDateOnly() throws {
        var draft = BottleDraft(try bottle())
        draft[.opened].text = ""
        same(draft.undoPatch(choice: .keepOpen), ["dateOpened": "2026-09-14"])
    }

    func testUndoingTheOpeningOfASealedBottleSealsItAgain() throws {
        var draft = BottleDraft(try bottle(["isOpen": false, "status": "owned", "fillPct": 100, "dateOpened": NSNull()]))
        draft[.opened].text = "2026-10-01"
        same(draft.undoPatch(), ["dateOpened": NSNull(), "ifOpenedCleared": "seal"])
    }

    func testUndoingTheDatingOfAnUndatedOpenBottleKeepsItOpen() throws {
        var draft = BottleDraft(try bottle(["dateOpened": NSNull()]))
        draft[.opened].text = "2026-10-01"
        same(draft.undoPatch(), ["dateOpened": NSNull(), "ifOpenedCleared": "keep_open"])
    }

    func testBottleChecksBeforeAskingTheServer() throws {
        var draft = BottleDraft(try bottle())
        draft[.paid].text = "5a.99"
        draft[.releaseYear].text = "24"
        draft[.acquired].text = "2999-01-01"
        let errors = draft.errors(today: "2026-10-08")
        XCTAssertEqual(errors[.paid], "Enter a price like 54.99.")
        XCTAssertEqual(errors[.releaseYear], "Enter a four-digit year.")
        XCTAssertEqual(errors[.acquired], "That date is in the future.")
        draft[.paid].text = "54.99"
        XCTAssertNil(draft.errors(today: "2026-10-08")[.paid])
    }

    func testAnUntouchedValueIsNotCheckedAgainstTheRules() throws {
        // A price the server already holds in a shape the form would refuse is not the person's mistake.
        let draft = BottleDraft(try bottle(["pricePaid": "54.9900"]))
        XCTAssertTrue(draft.errors(today: "2026-10-08").isEmpty)
    }

    // MARK: Label

    func testLabelReadsAProofAsATypedNumber() throws {
        XCTAssertEqual(LabelDraft(try label())[.proof].original, "116.8")
        XCTAssertEqual(plainNumber("100.00"), "100")
        XCTAssertEqual(plainNumber("90"), "90")
        XCTAssertNil(plainNumber(nil))
    }

    func testLabelPatchHasTheRightTypes() throws {
        var draft = LabelDraft(try label())
        draft[.size].text = "1000"
        draft[.category].text = "7"
        draft[.proof].text = "116.4"
        draft[.barcode].text = "0 12345-678905"
        same(draft.patch(), ["sizeMl": 1000, "categoryId": 7, "proof": "116.4", "upc": "012345678905"])
    }

    func testLabelUndoSendsTheOldValuesWithTheirTypes() throws {
        var draft = LabelDraft(try label(["upc": "012345678905"]))
        draft[.size].text = "1000"
        draft[.barcode].text = ""
        draft[.name].text = "Rare Breed Barrel Proof"
        same(draft.undoPatch(), ["sizeMl": 750, "upc": "012345678905", "name": "Rare Breed"])
    }

    func testLabelChecks() throws {
        var draft = LabelDraft(try label())
        draft[.name].text = "  "
        draft[.proof].text = "250"
        draft[.size].text = "0"
        draft[.msrp].text = "cheap"
        draft[.barcode].text = "12"
        let errors = draft.errors()
        XCTAssertEqual(errors[.name], "Required.")
        XCTAssertEqual(errors[.proof], "Proof is a number from 0 to 200.")
        XCTAssertEqual(errors[.size], "Size is in millilitres, like 750.")
        XCTAssertEqual(errors[.msrp], "Enter a price like 54.99.")
        XCTAssertEqual(errors[.barcode], "A barcode is 6 to 32 digits.")
    }

    func testClearingALabelFactSendsNull() throws {
        var draft = LabelDraft(try label(["ageStatement": "4 Years"]))
        draft[.ageStatement].text = ""
        same(draft.patch(), ["ageStatement": NSNull()])
    }

    // MARK: Pickers

    private func linked() throws -> LabelDetail {
        try label([
            "links": [
                "distilleries": [["id": 1, "name": "Wild Turkey", "amount": 100, "inferred": false]],
                "mashbills": [["id": 5, "name": "75% Corn", "amount": NSNull(), "distilleryId": 1]],
                "finishes": [["id": 9, "name": "Port", "amount": 6]],
            ],
        ])
    }

    func testStoreIsSentAsItsIdAndClearedAsNull() throws {
        var draft = BottleDraft(try bottle(["storeId": 3, "store": "Total Wine"]))
        XCTAssertEqual(draft.storeName, "Total Wine")
        draft[.store].text = "8"
        same(draft.patch(), ["storeId": 8])
        same(draft.undoPatch(), ["storeId": 3])
        draft[.store].text = ""
        same(draft.patch(), ["storeId": NSNull()])
    }

    func testBrandIsSentAsItsIdAndUndone() throws {
        var draft = LabelDraft(try label())
        draft[.brand].text = "4"
        draft.brandName = "Russell's Reserve"
        same(draft.patch(), ["brandId": 4])
        same(draft.undoPatch(), ["brandId": 1])
    }

    func testChangingAListSendsAllThreeAndKeepsWhatARowCarried() throws {
        var draft = LabelDraft(try linked())
        XCTAssertFalse(draft.linksChanged)
        draft.setList(.distilleries, to: [LookupItem(id: 2, name: "Buffalo Trace"), LookupItem(id: 1, name: "Wild Turkey")])
        XCTAssertTrue(draft.linksChanged)
        XCTAssertTrue(draft.isDirty)
        let body = draft.patch()
        XCTAssertEqual(Set(body.keys), ["distilleries", "mashbills", "finishes"])
        let distilleries = body["distilleries"] as! [[String: Any]]
        XCTAssertEqual(distilleries.map { $0["id"] as! Int }, [2, 1], "in the order chosen")
        XCTAssertTrue(distilleries[0]["amount"] is NSNull, "a new row has no share yet")
        XCTAssertEqual(distilleries[1]["amount"] as? Double, 100, "an existing row keeps its share")
        let mashbills = body["mashbills"] as! [[String: Any]]
        XCTAssertEqual(mashbills[0]["distilleryId"] as? Int, 1)
        XCTAssertEqual((body["finishes"] as! [[String: Any]])[0]["amount"] as? Double, 6)
    }

    func testRemovingARowAndUndoingIt() throws {
        var draft = LabelDraft(try linked())
        draft.remove(.finishes, id: 9)
        XCTAssertTrue(draft.rows(.finishes).isEmpty)
        XCTAssertEqual((draft.patch()["finishes"] as! [[String: Any]]).count, 0)
        let undo = draft.undoPatch()
        XCTAssertEqual((undo["finishes"] as! [[String: Any]]).map { $0["id"] as! Int }, [9])
        XCTAssertEqual((undo["distilleries"] as! [[String: Any]]).map { $0["id"] as! Int }, [1])
    }

    func testTakingARowOffAndPuttingItBackLosesItsShare() throws {
        var draft = LabelDraft(try linked())
        draft.setList(.distilleries, to: [])
        XCTAssertTrue(draft.linksChanged)
        draft.setList(.distilleries, to: [LookupItem(id: 1, name: "Wild Turkey")])
        XCTAssertTrue(draft.linksChanged, "the share it had is gone, so this is not what it was")
    }

    func testALabelWithoutListsFromAnOlderServerStillEdits() throws {
        var draft = LabelDraft(try label())
        XCTAssertTrue(draft.rows(.distilleries).isEmpty)
        draft.setList(.finishes, to: [LookupItem(id: 9, name: "Port")])
        XCTAssertTrue(draft.linksChanged)
    }
}
