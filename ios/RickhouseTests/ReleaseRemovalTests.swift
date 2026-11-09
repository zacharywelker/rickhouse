import XCTest
@testable import Rickhouse

final class ReleaseRemovalTests: XCTestCase {
    func testTheQuestionNamesTheRelease() {
        XCTAssertEqual(ReleaseRemoval.title("2024-01"), "Remove “2024-01”?")
    }

    func testTheServersWarningIsShownAndNothingCanBeBroughtBack() {
        let warning = "Kentucky Tea has a photo and 2 bottles. Removing it: its photo will be deleted; the bottles stay but lose this release."
        XCTAssertEqual(ReleaseRemoval.message(removal: warning), warning + " This can't be undone.")
    }

    func testAReleaseWithNothingAttachedSaysSo() {
        XCTAssertEqual(ReleaseRemoval.message(removal: nil), "Nothing else is attached to it. This can't be undone.")
    }

    func testAReleaseReadsItsRemovalLineAndAnOlderServerHasNone() throws {
        let base: [String: Any] = ["id": 3, "name": "Batch 1", "releaseYear": 2024, "proof": "110", "ageStatement": NSNull(), "msrp": NSNull(), "photoThumbPath": NSNull()]
        var with = base
        with["removal"] = "Batch 1 has 1 bottle. Removing it: the bottle stays but loses this release."
        let release = try JSONDecoder().decode(LabelRelease.self, from: JSONSerialization.data(withJSONObject: with))
        XCTAssertEqual(release.removal, "Batch 1 has 1 bottle. Removing it: the bottle stays but loses this release.")

        let bare = try JSONDecoder().decode(LabelRelease.self, from: JSONSerialization.data(withJSONObject: base))
        XCTAssertNil(bare.removal)
        var null = base
        null["removal"] = NSNull()
        XCTAssertNil(try JSONDecoder().decode(LabelRelease.self, from: JSONSerialization.data(withJSONObject: null)).removal)
    }
}
