import XCTest
@testable import Rickhouse

final class DistilleryDraftTests: XCTestCase {
    func testNeedsANameAndACountry() {
        XCTAssertFalse(DistilleryDraft(name: "  ").canSave)
        XCTAssertFalse(DistilleryDraft(name: "Bowmore", country: " ").canSave)
        XCTAssertTrue(DistilleryDraft(name: "Bowmore").canSave)
    }

    func testBodyIsAlwaysMoreThanANameSoTheServerUsesTheWebRules() {
        let body = DistilleryDraft(name: "  Bowmore ", country: "Scotland", state: "", city: " Bowmore ", region: "Islay").body()
        XCTAssertEqual(body["name"] as? String, "Bowmore")
        XCTAssertEqual(body["country"] as? String, "Scotland")
        XCTAssertEqual(body["city"] as? String, "Bowmore")
        XCTAssertEqual(body["region"] as? String, "Islay")
        XCTAssertEqual(body["disclosure"] as? String, "named")
        XCTAssertEqual(body["isDefunct"] as? Bool, false)
        XCTAssertGreaterThan(body.keys.count, 1)
    }

    func testUndisclosedAndDefunctAreSent() {
        let body = DistilleryDraft(name: "Undisclosed (Indiana)", state: "Indiana", isDefunct: true, undisclosed: true).body()
        XCTAssertEqual(body["disclosure"] as? String, "undisclosed")
        XCTAssertEqual(body["isDefunct"] as? Bool, true)
    }

    func testFoundedIsANumberOnlyWhenItIsOne() {
        XCTAssertEqual(DistilleryDraft(name: "A", founded: "1779").body()["founded"] as? Int, 1779)
        XCTAssertNil(DistilleryDraft(name: "A", founded: "").body()["founded"])
    }

    func testDSPOnlyInTheUSAAndNOMOnlyInMexico() {
        var us = DistilleryDraft(name: "A", country: " usa ", dspNumber: "DSP-KY-95", nomNumber: "1234")
        XCTAssertTrue(us.showsDSP); XCTAssertFalse(us.showsNOM)
        XCTAssertEqual(us.body()["dspNumber"] as? String, "DSP-KY-95")
        XCTAssertNil(us.body()["nomNumber"])

        us.country = "México"
        XCTAssertTrue(us.showsNOM); XCTAssertFalse(us.showsDSP)
        XCTAssertEqual(us.body()["nomNumber"] as? String, "1234")
        XCTAssertNil(us.body()["dspNumber"])

        us.country = "Scotland"
        XCTAssertFalse(us.showsDSP); XCTAssertFalse(us.showsNOM)
    }

    func testTheRegionListMatchesTheServer() {
        XCTAssertEqual(DistilleryDraft.scotchRegions, ["Speyside", "Highland", "Lowland", "Islay", "Campbeltown", "Islands"])
    }

    func testDetailIsStateThenCountry() {
        XCTAssertEqual(DistilleryDraft(name: "A", country: "USA", state: " KY ").detail, "KY, USA")
        XCTAssertEqual(DistilleryDraft(name: "A", country: "Scotland").detail, "Scotland")
    }

    func testOnlyStoresAndDistilleriesOpenADetailsPage() {
        XCTAssertTrue(LookupKind.distilleries.opensDetailsForm)
        XCTAssertTrue(LookupKind.stores.opensDetailsForm)
        XCTAssertFalse(LookupKind.brands.opensDetailsForm)
        XCTAssertFalse(LookupKind.finishes.opensDetailsForm)
    }
}
