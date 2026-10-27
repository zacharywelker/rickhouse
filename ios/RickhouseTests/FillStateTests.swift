import XCTest
@testable import Rickhouse

final class FillStateTests: XCTestCase {
    func testStraightUpReadsAsHalf() {
        XCTAssertEqual(FillState.percent(dx: 0, dy: -40), 50)
    }

    func testTheHorizonsAreFullAndEmpty() {
        XCTAssertEqual(FillState.percent(dx: 40, dy: 0), 100)
        // dy is 0 here, and atan2(-0, -x) is -pi: the left peg must still read Empty.
        XCTAssertEqual(FillState.percent(dx: -40, dy: 0), 0)
    }

    /// A point `pct` of the way round the dial from the left horizon, 40 out from the hub.
    private func along(_ pct: Double) -> (dx: Double, dy: Double) {
        let angle = Double.pi - pct / 100 * Double.pi
        return (cos(angle) * 40, -sin(angle) * 40)
    }

    func testTheDialDetentsOntoTheNearestTick() {
        let a = along(33)
        XCTAssertEqual(FillState.percent(dx: a.dx, dy: a.dy), 35)
        let b = along(5)
        XCTAssertEqual(FillState.percent(dx: b.dx, dy: b.dy), 5)
    }

    func testBelowTheHubSticksToTheNearerPeg() {
        XCTAssertEqual(FillState.percent(dx: -5, dy: 30), 0)
        XCTAssertEqual(FillState.percent(dx: 5, dy: 30), 100)
    }

    func testOnlyTheVeryEndOfTheDialIsEmpty() {
        let a = along(2)
        XCTAssertEqual(FillState.percent(dx: a.dx, dy: a.dy), 0)
    }

    func testSnapGoesToTheNearestFive() {
        XCTAssertEqual(FillTicks.snap(63), 65)
        XCTAssertEqual(FillTicks.snap(62), 60)
        XCTAssertEqual(FillTicks.snap(100), 100)
    }

    func testNudgeStepsOneTickEitherWay() {
        XCTAssertEqual(FillTicks.nudge(63, up: false), 60)
        XCTAssertEqual(FillTicks.nudge(63, up: true), 65)
        XCTAssertEqual(FillTicks.nudge(60, up: true), 65)
        XCTAssertEqual(FillTicks.nudge(60, up: false), 55)
        XCTAssertEqual(FillTicks.nudge(100, up: true), 100)
        XCTAssertEqual(FillTicks.nudge(0, up: false), 0)
        XCTAssertEqual(FillTicks.nudge(3, up: false), 0)
        XCTAssertEqual(FillTicks.nudge(3, up: true), 5)
    }

    // MARK: Sealed

    private func labelBottle(status: String, isOpen: Bool, fillPct: Int) throws -> LabelBottle {
        let json: [String: Any] = ["id": 1, "status": status, "isOpen": isOpen, "fillPct": fillPct]
        return try JSONDecoder().decode(LabelBottle.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func bottleDetail(status: String, isOpen: Bool, fillPct: Int) throws -> BottleDetail {
        let json: [String: Any] = [
            "id": 5, "expressionId": 10, "brand": "Wild Turkey", "name": "Rare Breed", "category": "Bourbon",
            "status": status, "isOpen": isOpen, "isFavorite": false, "fillPct": fillPct, "sizeMl": 750,
            "pricePaid": "49.99", "dateAcquired": "2026-08-30", "dateOpened": "2026-09-14",
            "distilleries": [], "finishes": [], "mashbills": [], "images": [], "tastingNotes": [],
        ]
        return try JSONDecoder().decode(BottleDetail.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testAnOwnedUnopenedFullBottleIsSealed() throws {
        XCTAssertTrue(try labelBottle(status: "owned", isOpen: false, fillPct: 100).isSealed)
        XCTAssertTrue(try bottleDetail(status: "owned", isOpen: false, fillPct: 100).isSealed)
    }

    func testASealedLookingBottleIsNotSealedBelowFull() throws {
        // The server treats an owned bottle under full as open.
        XCTAssertFalse(try labelBottle(status: "owned", isOpen: false, fillPct: 60).isSealed)
        XCTAssertFalse(try bottleDetail(status: "owned", isOpen: false, fillPct: 60).isSealed)
    }

    func testAnOpenBottleIsNotSealed() throws {
        XCTAssertFalse(try labelBottle(status: "owned", isOpen: true, fillPct: 100).isSealed)
        XCTAssertFalse(try labelBottle(status: "open", isOpen: false, fillPct: 100).isSealed)
    }

    func testKilledAndWishlistAreNeverSealed() throws {
        XCTAssertFalse(try labelBottle(status: "killed", isOpen: false, fillPct: 100).isSealed)
        XCTAssertFalse(try bottleDetail(status: "wishlist", isOpen: false, fillPct: 100).isSealed)
    }

    func testTheBandsMeetOnTheSameLinesAsTheWeb() {
        XCTAssertEqual(FillState.of(17).id, "almost-gone")
        XCTAssertEqual(FillState.of(18).id, "quarter")
        XCTAssertEqual(FillState.of(87).id, "three-quarters")
        XCTAssertEqual(FillState.of(88).id, "full")
    }

    // MARK: The nudge after a tasting

    private func tastingBottle(canNudge: Bool = true) -> TastingBottle {
        TastingBottle(id: 1, title: "Rare Breed", fillPct: 100, isSealed: true, canNudge: canNudge)
    }

    func testNewTastingFromAnOwnedBottleNudges() {
        XCTAssertTrue(FillNudge.shouldNudge(isNew: true, ownedBottle: tastingBottle()))
    }

    func testEditingNeverNudges() {
        XCTAssertFalse(FillNudge.shouldNudge(isNew: false, ownedBottle: tastingBottle()))
    }

    func testATastingWithNoOwnedBottleNeverNudges() {
        XCTAssertFalse(FillNudge.shouldNudge(isNew: true, ownedBottle: nil))
    }

    func testAKilledBottleNeverNudges() {
        XCTAssertFalse(FillNudge.shouldNudge(isNew: true, ownedBottle: tastingBottle(canNudge: false)))
    }

    func testTastingBottleCarriesTheLevelFromALabelBottle() throws {
        let sealed = TastingBottle(try labelBottle(status: "owned", isOpen: false, fillPct: 100))
        XCTAssertEqual(sealed.fillPct, 100)
        XCTAssertTrue(sealed.isSealed)
        XCTAssertTrue(sealed.canNudge)
        let killed = TastingBottle(try labelBottle(status: "killed", isOpen: false, fillPct: 0))
        XCTAssertFalse(killed.canNudge)
    }

    func testTastingBottleCarriesTheLevelFromABottlePage() throws {
        let open = TastingBottle(try bottleDetail(status: "open", isOpen: true, fillPct: 60), title: "Wild Turkey Rare Breed")
        XCTAssertEqual(open.fillPct, 60)
        XCTAssertFalse(open.isSealed)
        XCTAssertTrue(open.canNudge)
        XCTAssertEqual(open.title, "Wild Turkey Rare Breed")
    }
}
