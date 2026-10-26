import XCTest
@testable import Rickhouse

final class APIErrorTests: XCTestCase {
    func testServerProblemsSendTheUserBackToTheAddressStep() {
        let server: [APIError] = [.serverNotFound, .badServer, .insecureServer, .serverTooOld, .appTooOld, .transport(URLError(.notConnectedToInternet))]
        for error in server { XCTAssertTrue(error.isServerProblem, "\(error)") }
    }

    func testCredentialAndRequestProblemsStayOnTheAccountStep() {
        let account: [APIError] = [.server("Wrong username or password."), .unauthorized, .invalid(code: "x", message: "m", fields: [:])]
        for error in account { XCTAssertFalse(error.isServerProblem, "\(error)") }
    }
}
