import XCTest
@testable import Rickhouse

final class MergePlanTests: XCTestCase {
    private func label(_ overrides: [String: Any] = [:], bottles: Int = 0, tastings: Int = 0) throws -> LabelDetail {
        var json: [String: Any] = [
            "id": 10, "brandId": 1, "categoryId": 3, "brand": "Wild Turkey", "name": "Rare Breed", "category": "Bourbon",
            "proof": "116.80", "sizeMl": 750, "msrp": "49.99", "distilleries": [], "finishes": [], "mashbills": [],
            "releases": [],
            "bottles": (0..<bottles).map { ["id": $0 + 1, "status": "owned", "isOpen": false, "fillPct": 100] },
            "tastings": (0..<tastings).map { ["id": $0 + 1, "tastedOn": "2026-10-01"] },
        ]
        json.merge(overrides) { _, new in new }
        return try JSONDecoder().decode(LabelDetail.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testOnlyTheFactsThatDifferAreListedInAFixedOrder() throws {
        let plan = MergePlan(
            mine: try label(["proof": "116.8", "msrp": "49.99", "sizeMl": 750]),
            theirs: try label(["proof": "116.4", "msrp": "69.99", "sizeMl": 1000, "name": "Rare Breed Barrel Proof"])
        )
        XCTAssertEqual(plan.rows.map(\.fact), [.proof, .size, .msrp])
        XCTAssertEqual(plan.rows[0].mine, "116.8 proof")
        XCTAssertEqual(plan.rows[0].theirs, "116.4 proof")
        XCTAssertEqual(plan.rows[1].mine, "750 mL")
        XCTAssertEqual(plan.rows[1].theirs, "1000 mL")
    }

    func testTheSameValueWrittenTwoWaysIsNotADifference() throws {
        let plan = MergePlan(
            mine: try label(["proof": "116.80", "msrp": "49.9900", "ageStatement": " 4 Years "]),
            theirs: try label(["proof": "116.8", "msrp": "49.99", "ageStatement": "4 Years"])
        )
        XCTAssertTrue(plan.rows.isEmpty)
    }

    func testAMissingValueAndABlankOneAreTheSame() throws {
        let plan = MergePlan(mine: try label(["upc": ""]), theirs: try label())
        XCTAssertTrue(plan.rows.isEmpty)
    }

    func testAFactOneSideLacksReadsAsNone() throws {
        let plan = MergePlan(mine: try label(["upc": "012345678905"]), theirs: try label())
        XCTAssertEqual(plan.rows, [MergeRow(fact: .barcode, mine: "012345678905", theirs: "None")])
    }

    func testABarcodeTypedWithDashesIsTheSameBarcode() throws {
        let plan = MergePlan(mine: try label(["upc": "0 12345-678905"]), theirs: try label(["upc": "012345678905"]))
        XCTAssertTrue(plan.rows.isEmpty)
    }

    func testTheCategoryIsComparedById() throws {
        let plan = MergePlan(mine: try label(["categoryId": 3, "category": "Bourbon"]), theirs: try label(["categoryId": 4, "category": "Rye"]))
        XCTAssertEqual(plan.rows, [MergeRow(fact: .category, mine: "Bourbon", theirs: "Rye")])
    }

    func testKeepMineIsInAFixedOrderAndOnlyWhatWasChosen() {
        XCTAssertEqual(MergePlan.keepMine([.msrp, .proof]), ["proof", "msrp"])
        XCTAssertEqual(MergePlan.keepMine([]), [])
        XCTAssertEqual(MergePlan.keepMine([.size, .category, .barcode]), ["categoryId", "sizeMl", "upc"])
    }

    func testTheSummarySaysWhatMovesAndWhatIsRemoved() throws {
        let both = MergePlan(mine: try label(bottles: 2, tastings: 4), theirs: try label(["name": "Rare Breed Barrel Proof"]))
        XCTAssertEqual(both.summary, "Moves 2 bottles and 4 tastings. The Rare Breed label is then removed.")
        XCTAssertEqual(MergePlan(mine: try label(bottles: 1, tastings: 1), theirs: try label()).summary, "Moves 1 bottle and 1 tasting. The Rare Breed label is then removed.")
        XCTAssertEqual(MergePlan(mine: try label(bottles: 3), theirs: try label()).summary, "Moves 3 bottles. The Rare Breed label is then removed.")
        XCTAssertEqual(MergePlan(mine: try label(tastings: 2), theirs: try label()).summary, "Moves 2 tastings. The Rare Breed label is then removed.")
        XCTAssertEqual(MergePlan(mine: try label(), theirs: try label()).summary, "Nothing is on it to move. The Rare Breed label is then removed.")
    }

    func testTitles() throws {
        let plan = MergePlan(mine: try label(), theirs: try label(["name": "Rare Breed Barrel Proof"]))
        XCTAssertEqual(plan.mineTitle, "Wild Turkey Rare Breed")
        XCTAssertEqual(plan.theirsTitle, "Wild Turkey Rare Breed Barrel Proof")
    }
}
