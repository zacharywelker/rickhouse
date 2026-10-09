import XCTest
@testable import Rickhouse

final class PickerLogicTests: XCTestCase {
    private let items = ["Wild Turkey", "Buffalo Trace", "Four Roses", "Heaven Hill", "Jim Beam", "Maker's Mark"]
        .enumerated().map { LookupItem(id: $0.offset + 1, name: $0.element) }

    func testNamesAreComparedWithoutCaseSpacingOrAccents() {
        XCTAssertEqual(PickerLogic.normalize("  Wild   TURKEY "), "wild turkey")
        XCTAssertEqual(PickerLogic.normalize("Rhum Clément"), "rhum clement")
    }

    func testMatchingIsContainsAndEverythingWhenEmpty() {
        XCTAssertEqual(PickerLogic.matching("", in: items).count, 6)
        XCTAssertEqual(PickerLogic.matching("ROSES", in: items).map(\.name), ["Four Roses"])
        XCTAssertEqual(PickerLogic.matching("ea", in: items).map(\.name), ["Heaven Hill", "Jim Beam"])
    }

    func testExactIgnoresCaseAndSpacing() {
        XCTAssertEqual(PickerLogic.exact("wild   turkey", in: items)?.id, 1)
        XCTAssertNil(PickerLogic.exact("Wild Turk", in: items))
        XCTAssertNil(PickerLogic.exact("   ", in: items))
    }

    func testNearMatchesFindATypoAndAContainedName() {
        XCTAssertEqual(PickerLogic.nearMatches("Wild Turky", in: items).map(\.name), ["Wild Turkey"])
        XCTAssertEqual(PickerLogic.nearMatches("Buffalo", in: items).map(\.name), ["Buffalo Trace"])
        XCTAssertEqual(PickerLogic.nearMatches("Heven Hill", in: items).map(\.name), ["Heaven Hill"])
    }

    func testNearMatchesLeaveOutTheExactNameAndUnrelatedOnes() {
        XCTAssertTrue(PickerLogic.nearMatches("Wild Turkey", in: items).isEmpty)
        XCTAssertTrue(PickerLogic.nearMatches("Sazerac", in: items).isEmpty)
        XCTAssertTrue(PickerLogic.nearMatches("Wi", in: items).isEmpty, "two letters match everything, so nothing is offered")
    }

    func testNewIsOfferedOnlyForANameNotThereAndAKindThatCanBeMade() {
        XCTAssertTrue(PickerLogic.offersNew("Austin Nichols", kind: .distilleries, in: items))
        XCTAssertFalse(PickerLogic.offersNew("wild turkey", kind: .distilleries, in: items), "it is already there")
        XCTAssertFalse(PickerLogic.offersNew("", kind: .distilleries, in: items))
        XCTAssertFalse(PickerLogic.offersNew("Total Wine", kind: .stores, in: items), "stores are made on the web")
        XCTAssertFalse(PickerLogic.offersNew("High Rye", kind: .mashbills, in: items), "mashbills are made on the web")
    }

    func testDistance() {
        XCTAssertEqual(PickerLogic.distance("kitten", "sitting"), 3)
        XCTAssertEqual(PickerLogic.distance("", "abc"), 3)
        XCTAssertEqual(PickerLogic.distance("same", "same"), 0)
    }
}
