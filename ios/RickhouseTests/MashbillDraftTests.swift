import XCTest
@testable import Rickhouse

final class MashbillDraftTests: XCTestCase {
    private func recipe(_ pairs: (String, String)...) -> MashbillDraft {
        MashbillDraft(rows: pairs.map { GrainRow(grain: $0.0, percent: $0.1) })
    }

    func testARecipeThatAddsUpCanBeSaved() {
        let d = recipe(("Corn", "75"), ("Rye", "25"))
        XCTAssertNil(d.problem); XCTAssertTrue(d.canSave)
        XCTAssertEqual(d.totalStatus, .exact)
    }

    func testAnEmptyRecipeNeedsAnIngredientUnlessItIsSecretOrGeneric() {
        XCTAssertEqual(MashbillDraft().problem, "Add at least one ingredient.")
        XCTAssertEqual(MashbillDraft(isSecret: true).problem, "Give a secret mashbill a reference name, such as Buffalo Trace Wheated.")
        XCTAssertNil(MashbillDraft(isSecret: true, name: "Buffalo Trace Wheated").problem)
        XCTAssertEqual(MashbillDraft(isGeneric: true).problem, "Name the style, such as High Rye.")
        XCTAssertNil(MashbillDraft(isGeneric: true, name: "High Rye").problem)
    }

    func testTheTotalHasTheDatabasesSlack() {
        XCTAssertNil(recipe(("Corn", "99")).problem)
        XCTAssertNil(recipe(("Corn", "60"), ("Rye", "41")).problem)
        XCTAssertEqual(recipe(("Corn", "60"), ("Rye", "41")).totalStatus, .tolerated)
        XCTAssertNotNil(recipe(("Corn", "98.9")).problem)
        XCTAssertNotNil(recipe(("Corn", "60"), ("Rye", "41.1")).problem)
        XCTAssertEqual(recipe(("Corn", "70"), ("Rye", "10")).totalStatus, .short(20))
        XCTAssertEqual(recipe(("Corn", "80"), ("Rye", "30")).totalStatus, .over(10))
    }

    func testAPartialDisclosureMayFallShortButNotOver() {
        var d = recipe(("Corn", "60"))
        d.isPartial = true
        XCTAssertNil(d.problem)
        XCTAssertEqual(d.totalStatus, .undisclosed(40))
        d.rows.append(GrainRow(grain: "Rye", percent: "50"))
        XCTAssertEqual(d.problem, "The disclosed grains exceed 100% (110%).")
    }

    func testTheSameGrainTwiceIsRefusedWhateverTheCase() {
        XCTAssertEqual(recipe(("Corn", "50"), (" corn ", "50")).problem, "corn is in there twice. Combine them into one row.")
    }

    func testABadShareOrGrainIsNamed() {
        XCTAssertEqual(recipe(("Corn", "101")).problem, "Corn: 100% at the most.", "one grain can't be more than all of it")
        XCTAssertEqual(recipe(("Corn", "abc")).problem, "Enter the percent for Corn.")
        XCTAssertEqual(recipe(("Corn", "0")).problem, "Corn: more than 0%.")
        XCTAssertEqual(recipe(("Corn", "")).problem, "Enter the percent for Corn.")
        XCTAssertEqual(recipe(("", "100")).problem, "Name the grain.")
        XCTAssertNil(recipe(("Corn", "33,3"), ("Rye", "33,3"), ("Barley", "33,4")).problem, "a comma is a decimal point")
    }

    func testAnEmptyRowIsIgnoredNotRefused() {
        var d = recipe(("Corn", "100"))
        d.rows.append(GrainRow())
        XCTAssertNil(d.problem)
        XCTAssertEqual((d.body()["grains"] as? [[String: Any]])?.count, 1)
    }

    func testSecretAndGenericAreNeverBothOn() {
        var d = MashbillDraft()
        d.setSecret(true); d.setGeneric(true)
        XCTAssertTrue(d.isGeneric); XCTAssertFalse(d.isSecret)
        d.isPartial = true
        d.setSecret(true)
        XCTAssertTrue(d.isSecret); XCTAssertFalse(d.isGeneric)
        d.setGeneric(true)
        XCTAssertFalse(d.isPartial, "a style has nothing to be partial about")
    }

    func testWhatThePageShows() {
        XCTAssertFalse(MashbillDraft().showsName); XCTAssertTrue(MashbillDraft().showsIngredients)
        XCTAssertTrue(MashbillDraft(isSecret: true).showsName); XCTAssertTrue(MashbillDraft(isSecret: true).showsIngredients)
        XCTAssertTrue(MashbillDraft(isGeneric: true).showsName); XCTAssertFalse(MashbillDraft(isGeneric: true).showsIngredients)
    }

    func testARecipeIsSentWithNoNameAndAStyleWithNoRecipe() {
        let r = MashbillDraft(name: "ignored", rows: [GrainRow(grain: " Corn ", percent: "75"), GrainRow(grain: "Rye", percent: "25")]).body()
        XCTAssertNil(r["name"])
        let grains = r["grains"] as? [[String: Any]]
        XCTAssertEqual(grains?.map { $0["grain"] as? String }, ["Corn", "Rye"])
        XCTAssertEqual(grains?.map { $0["percent"] as? Double }, [75, 25])

        let s = MashbillDraft(isGeneric: true, name: " High Rye ", rows: [GrainRow(grain: "Corn", percent: "50")]).body()
        XCTAssertEqual(s["name"] as? String, "High Rye")
        XCTAssertNil(s["grains"])
        XCTAssertEqual(s["isGeneric"] as? Bool, true)
    }

    func testTheMenuOffersWhatIsNotAlreadyThere() {
        let d = recipe(("corn", "100"))
        XCTAssertFalse(d.unusedCommonGrains.contains("Corn"))
        XCTAssertTrue(d.unusedCommonGrains.contains("Rye"))
        XCTAssertEqual(MashbillDraft.commonGrains.first, "Corn")
    }
}
