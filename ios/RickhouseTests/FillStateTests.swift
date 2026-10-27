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

    func testTheDialDetentsOntoTheQuickStates() {
        // 60 degrees along from the left horizon is 33%: closer to a quarter than to half.
        let angle = Double.pi - Double.pi / 3
        XCTAssertEqual(FillState.percent(dx: cos(angle) * 40, dy: -sin(angle) * 40), 25)
    }

    func testBelowTheHubSticksToTheNearerPeg() {
        XCTAssertEqual(FillState.percent(dx: -5, dy: 30), 0)
        XCTAssertEqual(FillState.percent(dx: 5, dy: 30), 100)
    }

    func testOnlyTheVeryEndOfTheDialIsEmpty() {
        let angle = Double.pi * 5 / 100 // 5% along from the left
        XCTAssertEqual(FillState.percent(dx: -cos(angle) * 40, dy: -sin(angle) * 40), 10)
    }

    func testTheBandsMeetOnTheSameLinesAsTheWeb() {
        XCTAssertEqual(FillState.of(17).id, "almost-gone")
        XCTAssertEqual(FillState.of(18).id, "quarter")
        XCTAssertEqual(FillState.of(87).id, "three-quarters")
        XCTAssertEqual(FillState.of(88).id, "full")
    }
}
