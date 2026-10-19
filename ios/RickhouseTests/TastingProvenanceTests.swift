import XCTest
@testable import Rickhouse

/// Mirrors src/lib/__tests__/provenance.test.ts (`provenanceTags`); change one list, change the other.
final class TastingProvenanceTests: XCTestCase {
    private func tasting(_ extra: [String: Any] = [:]) throws -> LabelTasting {
        var json: [String: Any] = ["id": 1, "tastedOn": "2026-10-03"]
        json.merge(extra) { _, new in new }
        return try JSONDecoder().decode(LabelTasting.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func tags(_ p: [String: Any]) throws -> [String] {
        var full: [String: Any] = ["singleBarrel": false, "privateSelection": false]
        full.merge(p) { _, new in new }
        return Format.provenanceTags(try tasting(["provenance": full]).provenance)
    }

    func testAnOlderServerSendsNoProvenance() throws {
        let t = try tasting()
        XCTAssertNil(t.provenance)
        XCTAssertEqual(Format.provenanceTags(t.provenance), [])
    }

    func testNullProvenanceMeansAStandardBottleOrNoBottle() throws {
        let t = try tasting(["provenance": NSNull()])
        XCTAssertNil(t.provenance)
        XCTAssertEqual(Format.provenanceTags(t.provenance), [])
    }

    func testAPrivateSingleBarrelPickReadsInFull() throws {
        XCTAssertEqual(
            try tags(["singleBarrel": true, "privateSelection": true, "pickName": "Fall barrel",
                      "pickedBy": "Total Wine", "barrelNumber": "1234"]),
            ["Private selection", "“Fall barrel”", "Picked by Total Wine", "Single barrel", "Barrel 1234"]
        )
    }

    func testAPlainSingleBarrel() throws {
        XCTAssertEqual(try tags(["singleBarrel": true]), ["Single barrel"])
    }

    func testAReleaseDoesNotRepeatItsYear() throws {
        XCTAssertEqual(try tags(["release": "Spring 2024", "releaseYear": 2024]), ["Spring 2024"])
    }

    func testABatchAndYearShowWhenThereIsNoReleaseName() throws {
        XCTAssertEqual(try tags(["batch": "B521", "releaseYear": 2021]), ["Batch B521", "2021"])
    }

    func testTheReleaseNameBeatsABatch() throws {
        XCTAssertEqual(try tags(["release": "Spring 2024", "batch": "B1"]), ["Spring 2024"])
    }

    func testTheYearStaysWhenTheReleaseOnlyContainsItInALongerNumber() throws {
        XCTAssertEqual(try tags(["release": "Batch 20240", "releaseYear": 2024]), ["Batch 20240", "2024"])
        XCTAssertEqual(try tags(["release": "Batch 12024", "releaseYear": 2024]), ["Batch 12024", "2024"])
    }

    func testADifferentYearShowsBesideTheRelease() throws {
        XCTAssertEqual(try tags(["release": "Spring 2023", "releaseYear": 2024]), ["Spring 2023", "2024"])
    }

    func testAReleaseWithNoYearDigitsShowsTheYear() throws {
        XCTAssertEqual(try tags(["release": "Spring", "releaseYear": 2024]), ["Spring", "2024"])
    }

    func testPrivateSelectionAloneWhenFlaggedWithNoPicker() throws {
        XCTAssertEqual(try tags(["privateSelection": true]), ["Private selection"])
    }

    func testTheReleaseNameIsTrimmed() throws {
        XCTAssertEqual(try tags(["release": "  Spring "]), ["Spring"])
    }
}
