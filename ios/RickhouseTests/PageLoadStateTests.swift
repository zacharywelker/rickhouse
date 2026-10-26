import XCTest
@testable import Rickhouse

final class PageLoadStateTests: XCTestCase {
    func testRefreshRejectsAnOlderPaginationResponse() throws {
        var state = PageLoadState()
        let first = state.reload()
        XCTAssertTrue(state.finish(first, pageCount: 3))
        let oldPage = try XCTUnwrap(state.next())
        let refresh = state.reload()
        XCTAssertFalse(state.finish(oldPage, pageCount: 3))
        XCTAssertNil(state.next(), "An old completion must not unlock the active refresh")
        XCTAssertTrue(state.finish(refresh, pageCount: 2))
        XCTAssertEqual(state.next()?.page, 2)
    }

    func testFailedPageIsRetriedWithoutSkipping() throws {
        var state = PageLoadState()
        let first = state.reload()
        XCTAssertTrue(state.finish(first, pageCount: 3))
        let page = try XCTUnwrap(state.next())
        XCTAssertEqual(page.page, 2)
        XCTAssertTrue(state.fail(page))
        XCTAssertEqual(state.next()?.page, 2)
    }

    func testInvalidationStopsPaginationUntilNewFirstPageArrives() {
        var state = PageLoadState()
        let first = state.reload()
        XCTAssertTrue(state.finish(first, pageCount: 3))
        state.invalidate()
        XCTAssertNil(state.next())
        let fresh = state.reload()
        XCTAssertTrue(state.finish(fresh, pageCount: 1))
        XCTAssertNil(state.next())
    }

    func testOldFailureCannotClearTheLatestRequest() {
        var state = PageLoadState()
        let old = state.reload()
        let latest = state.reload()
        XCTAssertFalse(state.fail(old))
        XCTAssertTrue(state.isCurrent(latest))
    }
}
