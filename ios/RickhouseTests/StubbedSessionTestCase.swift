import XCTest
@testable import Rickhouse

/// Runs each test with `APIClient.session` bound to a session whose configuration carries `StubURLProtocol`,
/// so no server is needed. Tasks the test starts inherit the binding.
class StubbedSessionTestCase: XCTestCase {
    override func invokeTest() {
        StubURLProtocol.reset()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        APIClient.$session.withValue(URLSession(configuration: config)) { super.invokeTest() }
    }
}
