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

    func testFlagsGoAsBooleansAndOnlyWhenChanged() throws {
        var draft = LabelDraft(try label(["isCaskStrength": false, "isBottledInBond": true]))
        same(draft.patch(), [:])
        draft[.isCaskStrength].text = "true"
        draft[.isBottledInBond].text = "false"
        same(draft.patch(), ["isCaskStrength": true, "isBottledInBond": false])
        same(draft.undoPatch(), ["isCaskStrength": false, "isBottledInBond": true])
    }

    func testDatesAreCheckedAndAnOlderServerReadsAsNoFlags() throws {
        var draft = LabelDraft(try label())
        XCTAssertEqual(draft[.isNas].text, "false")
        draft[.distilled].text = "2019-02-30"
        draft[.bottled].text = "2024-05-14"
        XCTAssertEqual(draft.errors()[.distilled], "Enter a date like 2019-05-14.")
        XCTAssertNil(draft.errors()[.bottled])
        same(draft.patch(), ["barrelFilledOn": "2019-02-30", "bottledOn": "2024-05-14"])
    }

    func testStrengthTierMatchesTheServer() {
        XCTAssertEqual(Strength.tier(group: "rum", proof: "108"), "Navy Strength")
        XCTAssertEqual(Strength.tier(group: "rum", proof: "114"), "Overproof")
        XCTAssertNil(Strength.tier(group: "rum", proof: "107.9"))
        XCTAssertEqual(Strength.tier(group: "gin", proof: "120"), "Navy Strength")
        XCTAssertNil(Strength.tier(group: "whiskey", proof: "130"))
    }

    func testABottleGoesByItsLabelsDatesUntilItHasOwn() throws {
        let bottle = try bottle(["labelBarrelFilledOn": "2015-03-01", "barrelFilledOn": "2016-01-02"])
        var draft = BottleDraft(bottle)
        XCTAssertEqual(draft.labelDistilled, "2015-03-01")
        draft[.distilled].text = ""
        same(draft.patch(), ["barrelFilledOn": NSNull()])
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

    // MARK: Bottle form (add and edit share a draft)

    private func option() throws -> LabelOption {
        try JSONDecoder().decode(LabelOption.self, from: JSONSerialization.data(withJSONObject: [
            "id": 12, "name": "Rare Breed", "brand": "Wild Turkey", "category": "Bourbon",
        ]))
    }

    func testANewBottleSendsOnlyWhatWasFilledIn() throws {
        var draft = BottleDraft.new(label: try option(), today: "2026-10-13")
        same(draft.patch(), ["expressionId": 12, "dateAcquired": "2026-10-13"])
        draft[.paid].text = "54.99"
        draft[.singleBarrel].text = "true"
        draft[.size].text = "1000"
        draft[.store].text = "3"
        same(draft.patch(), ["expressionId": 12, "dateAcquired": "2026-10-13", "pricePaid": "54.99", "isSingleBarrel": true, "sizeMl": "1000", "storeId": 3])
        XCTAssertTrue(draft.showsBarrelDetail)
    }

    func testAChosenReleaseTakesOverTheBatchAndYear() throws {
        var draft = BottleDraft(try bottle(["batch": "B1", "releaseYear": 2020]))
        draft[.batch].text = "B2"
        XCTAssertEqual(Set(draft.patch().keys), ["batch"])
        draft[.release].text = "5"
        XCTAssertTrue(draft.onRelease)
        same(draft.patch(), ["releaseId": 5]) // the batch is the release's now, so it is not sent
        same(draft.undoPatch(), ["releaseId": NSNull(), "batch": "B1", "releaseYear": "2020"])
    }

    func testABottleOnAReleaseHasNoBatchOfItsOwn() throws {
        let draft = BottleDraft(try bottle(["releaseId": 5, "batch": "2024-01 Springfield", "releaseYear": 2024]))
        XCTAssertTrue(draft[.batch].isEmpty, "the server shows the release's name as the batch; it is not the bottle's")
        XCTAssertFalse(draft.isDirty)
        var cleared = draft
        cleared[.release].text = ""
        same(cleared.patch(), ["releaseId": NSNull()])
    }

    func testSwitchingTheLabelSendsItWithTheReleaseDropped() throws {
        var draft = BottleDraft(try bottle(["releaseId": 5]))
        draft[.label].text = "12"
        draft[.release].text = ""
        same(draft.patch(), ["expressionId": 12, "releaseId": NSNull()])
        same(draft.undoPatch(), ["expressionId": 10, "releaseId": 5])
    }

    func testTheBottlesOwnProofAgeAndSizeAreCheckedAndSent() throws {
        var draft = BottleDraft(try bottle(["own": ["proof": "118.40", "ageYears": "7.0", "ageMonths": 3, "sizeMl": 1000]]))
        XCTAssertEqual(draft[.proof].text, "118.4")
        XCTAssertEqual(draft[.ageYears].text, "7")
        XCTAssertFalse(draft.isDirty)
        draft[.proof].text = "201"
        draft[.size].text = "0"
        draft[.ageMonths].text = "x"
        draft[.bottled].text = "2020-01-01"
        draft[.distilled].text = "2021-01-01"
        let found = draft.errors(today: "2026-10-13")
        XCTAssertEqual(Set(found.keys), [.proof, .size, .ageMonths, .bottled])
        draft[.proof].text = ""
        same(draft.patch().filter { $0.key == "proof" }, ["proof": NSNull()]) // blank goes back to the label's
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

    func testMoneyInputStopsAtTwoPlaces() {
        XCTAssertEqual(Format.moneyInput("49.999"), "49.99")
        XCTAssertEqual(Format.moneyInput("1.2.3"), "1.23")
        XCTAssertEqual(Format.moneyInput("12,5"), "12,5")
        XCTAssertEqual(Format.moneyInput("$1a0"), "10")
        XCTAssertEqual(Format.moneyInput("120"), "120")
    }

    func testStrengthConvertsBothWays() {
        XCTAssertEqual(Strength.abv(fromProof: "101"), "50.5")
        XCTAssertEqual(Strength.abv(fromProof: "116.8"), "58.4")
        XCTAssertEqual(Strength.proof(fromABV: "50.5"), "101")
        XCTAssertEqual(Strength.proof(fromABV: "58.45"), "116.9")
        XCTAssertEqual(Strength.proof(fromABV: ""), "")
        XCTAssertEqual(Strength.abv(fromProof: ""), "")
    }

    private func blank(_ ticks: [LabelFact] = []) -> LabelDraft {
        var draft = LabelDraft()
        for tick in ticks { draft[tick].text = "true" }
        return draft
    }

    private func ticking(_ draft: LabelDraft, _ fact: LabelFact, _ on: Bool = true) -> LabelDraft {
        var next = draft
        next[fact].text = on ? "true" : "false"
        return AgeDefaults.apply(prev: draft, next: next, changed: fact)
    }

    func testStraightImpliesYearsOnlyOverBlankOrItsOwn() {
        var d = ticking(blank(), .isStraight)
        XCTAssertEqual(d[.ageYears].text, "2")
        d = ticking(d, .isNas)
        XCTAssertEqual(d[.ageYears].text, "4")
        XCTAssertEqual(d[.ageStatement].text, "", "an age is filled, so NAS offers no statement")
        var typed = blank()
        typed[.ageYears].text = "6"
        XCTAssertEqual(ticking(typed, .isStraight)[.ageYears].text, "6")
    }

    func testBondLocksProofAndOffersAStatementOnlyOverItsOwn() {
        let d = ticking(blank(), .isBottledInBond)
        XCTAssertEqual(d[.proof].text, "100")
        XCTAssertEqual(d[.ageYears].text, "4")
        XCTAssertEqual(d[.ageStatement].text, "")
        XCTAssertEqual(ticking(d, .isBottledInBond, false)[.ageYears].text, "")
        var seven = blank()
        seven[.ageStatement].text = "7 Year"
        XCTAssertEqual(ticking(seven, .isBottledInBond)[.ageStatement].text, "7 Year")
    }

    func testRulesByCategory() {
        let vodka = LabelRules(category: CategoryOption(id: 1, name: "Vodka", parent: nil, group: "vodka", kind: "other"))
        XCTAssertFalse(vodka.showsAging); XCTAssertFalse(vodka.showsFinishes)
        let scotch = LabelRules(category: CategoryOption(id: 2, name: "Single Malt Scotch", parent: nil, group: "whiskey", kind: "scotch"))
        XCTAssertTrue(scotch.showsAging); XCTAssertFalse(scotch.showsAmerican)
        let rum = LabelRules(category: CategoryOption(id: 3, name: "Rum", parent: nil, group: "rum", kind: "other"))
        XCTAssertTrue(rum.baseReplacesMashbill)
        var gin = LabelRules(category: CategoryOption(id: 4, name: "Gin", parent: nil, group: "gin", kind: "other"))
        XCTAssertTrue(gin.isUnaged)
        gin.ginAged = true
        XCTAssertTrue(gin.showsFinishes)
        let unknown = LabelRules(category: nil)
        XCTAssertTrue(unknown.showsAmerican, "an older server shows everything")
    }

    func testNewFactsGoInThePatch() throws {
        var d = LabelDraft(try label(["ageYears": "4.00", "isNas": false, "otherNames": "Hirsch"]))
        XCTAssertEqual(d[.ageYears].text, "4")
        d[.ageMonths].text = "6"
        d[.isStraight].text = "true"
        d[.otherNames].text = ""
        let body = d.patch()
        XCTAssertEqual(body["ageMonths"] as? Int, 6)
        XCTAssertEqual(body["isStraight"] as? Bool, true)
        XCTAssertTrue(body["otherNames"] is NSNull)
        XCTAssertNil(body["ageYears"])
    }

    func testAgeFromDatesFollowsTheCalendar() {
        XCTAssertEqual(DatedAge(filled: "2012-03-14", bottled: "2024-09-02"), DatedAge(filled: "2012-03-14", bottled: "2024-09-02"))
        let a = DatedAge(filled: "2012-03-14", bottled: "2024-09-02")!
        XCTAssertEqual([a.years, a.months, a.days], [12, 5, 19])
        let leap = DatedAge(filled: "2020-01-31", bottled: "2020-03-01")!
        XCTAssertEqual([leap.years, leap.months, leap.days], [0, 1, 1])
        let day = DatedAge(filled: "2020-02-29", bottled: "2024-02-29")!
        XCTAssertEqual([day.years, day.months, day.days], [4, 0, 0])
        XCTAssertNil(DatedAge(filled: "2024-01-01", bottled: "2020-01-01"))
        XCTAssertNil(DatedAge(filled: "2020-13-01", bottled: "2021-01-01"))
        XCTAssertEqual(a.described, "12 Year 5 Month")
    }
}
