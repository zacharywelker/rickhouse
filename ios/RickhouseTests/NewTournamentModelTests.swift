import XCTest
@testable import Rickhouse

final class NewTournamentModelTests: XCTestCase {
    private func bottle(_ id: Int) -> PickedEntry { .bottle(PickedBottle(bottleId: id, expressionId: id + 100, name: "B\(id)")) }

    func testCreateNeedsOnlyAName() {
        var d = NewTournamentDraft()
        XCTAssertFalse(d.canCreate)
        XCTAssertEqual(d.disabledReason, "Give the tournament a name to create it.")
        d.name = "   "
        XCTAssertFalse(d.canCreate)
        d.name = " Bourbon, spring "
        XCTAssertTrue(d.canCreate)
        XCTAssertNil(d.disabledReason)
    }

    func testHelperLine() {
        var d = NewTournamentDraft()
        XCTAssertEqual(d.helperLine, "No entries yet: you can make the draft now and fill the field later. Starting needs at least 2.")
        d.field = FieldState(entries: [bottle(1)], notice: nil)
        XCTAssertTrue(d.helperLine.hasPrefix("One entry:"))
        d.field = FieldState(entries: [bottle(1), bottle(2)], notice: nil)
        d.heatSize = 3
        XCTAssertEqual(d.helperLine, "2 entries in flights of 3. The field and settings stay editable until you start.")
    }

    func testRequest() {
        var d = NewTournamentDraft()
        d.name = " Rye "
        d.fieldNote = "  "
        d.field = FieldState(entries: [bottle(1), .label(PickedLabel(expressionId: 7, name: "L")), .adhoc(PickedAdhoc(key: "x", name: "X"))], notice: nil)
        let r = d.request
        XCTAssertEqual(r.name, "Rye")
        XCTAssertEqual(r.heatSize, 4)
        XCTAssertEqual(r.seeding, .similar)
        XCTAssertEqual(r.groupOrder, ["proof", "mashbill", "distillery", "age", "finish"])
        XCTAssertEqual(r.blind, false)
        XCTAssertNil(r.fieldNote)
        XCTAssertEqual(r.entries, [.bottle(1), .label(7), .outside("X")])
        d.fieldNote = " why "
        XCTAssertEqual(d.request.fieldNote, "why")
    }

    func testFormFieldErrors() {
        let e = FormFieldErrors(fields: ["name": "Too long", "entries.3": "Not yours"])
        XCTAssertEqual(e.message(for: "name"), "Too long")
        XCTAssertEqual(e.message(for: "entries"), "Not yours")
        XCTAssertNil(e.message(for: "heatSize"))
        XCTAssertNil(FormFieldErrors(fields: ["entriesX": "no"]).message(for: "entries"))
    }

    func testStaleAnswersAreDropped() {
        var t = RequestTicket()
        let first = t.issue()
        let second = t.issue()
        XCTAssertFalse(t.isCurrent(first))
        XCTAssertTrue(t.isCurrent(second))
    }

    func testFilterDefaultsAndStatusChips() {
        XCTAssertEqual(FieldFilters.initial.statuses, ["owned", "open"])
        XCTAssertEqual(FieldFilters.initial.queryItems.map { "\($0.name)=\($0.value ?? "")" }, ["statuses=open,owned"])
        let f = FieldFilters.initial.togglingStatus("owned").togglingStatus("open")
        XCTAssertEqual(f.statuses, [])
        XCTAssertEqual(f.queryItems.first { $0.name == "statuses" }?.value, "all")
        XCTAssertEqual(FieldFilters.initial.togglingStatus("sold").statuses, ["owned", "open", "sold"])
        XCTAssertEqual(FieldFilters.allStatuses.count, 7)
    }

    func testFilterQuery() {
        var f = FieldFilters.initial
        f.q = "  old  "
        f.categoryIds = [3, 1]
        f.opened = .sealed
        f.tasted = .untasted
        let items = f.queryItems.map { "\($0.name)=\($0.value ?? "")" }
        XCTAssertEqual(items, ["q=old", "categoryIds=1,3", "statuses=open,owned", "opened=sealed", "tasted=untasted"])
    }

    func testPickerText() {
        XCTAssertEqual(FieldPickerText.cutoffLine(shown: 500, total: 812), "Showing 500 of 812 matches")
        XCTAssertNil(FieldPickerText.cutoffLine(shown: 30, total: 30))
        XCTAssertEqual(FieldPickerText.chosenLine(chosen: 3, shown: 30), "3 of 30 chosen")
        XCTAssertEqual(FieldPickerText.summaryTitle(12), "Field · 12 chosen")
        XCTAssertEqual(FieldPickerText.kind(bottle(1)), "Bottle")
        XCTAssertEqual(FieldPickerText.kind(.label(PickedLabel(expressionId: 1, name: "x"))), "Label only")
    }
}
