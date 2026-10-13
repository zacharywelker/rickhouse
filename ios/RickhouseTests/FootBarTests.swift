import XCTest
@testable import Rickhouse

@MainActor
final class FootBarTests: XCTestCase {
    func testRetryClearsTheFailureAndRunsTheAction() {
        let bar = FootBar()
        var runs = 0
        bar.fail("Couldn't save") { runs += 1 }
        XCTAssertEqual(bar.failure?.message, "Couldn't save")
        bar.retryFailure()
        XCTAssertNil(bar.failure)
        XCTAssertEqual(runs, 1)
        bar.retryFailure()
        XCTAssertEqual(runs, 1, "nothing left to retry")
    }

    func testRetryThatFailsAgainLeavesANewFailure() {
        let bar = FootBar()
        bar.fail("first") { bar.fail("second") {} }
        bar.retryFailure()
        XCTAssertEqual(bar.failure?.message, "second")
    }

    func testASuccessReplacesAFailure() {
        let bar = FootBar()
        bar.fail("Couldn't save") {}
        bar.show("Saved.")
        XCTAssertNil(bar.failure)
        bar.fail("Again") {}
        bar.offer(UndoOffer(message: "Saved") {})
        XCTAssertNil(bar.failure)
        bar.dismissFailure()
        XCTAssertNil(bar.failure)
    }
}
