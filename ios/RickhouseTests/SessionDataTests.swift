import XCTest
@testable import Rickhouse

@MainActor
final class SessionDataTests: StubbedSessionTestCase {
    private var savedToken: String?
    private var savedServer: String?
    private var session: Session!

    override func setUp() {
        savedToken = Keychain.read("authToken")
        savedServer = UserDefaults.standard.string(forKey: "serverURL")
        Keychain.write("authToken", value: "session-test-token")
        session = Session()
        session.saveServer(URL(string: "https://session-tests.example")!)
    }

    override func tearDown() {
        if let savedToken { Keychain.write("authToken", value: savedToken) }
        else { Keychain.delete("authToken") }
        if let savedServer { UserDefaults.standard.set(savedServer, forKey: "serverURL") }
        else { UserDefaults.standard.removeObject(forKey: "serverURL") }
        Format.currencyCode = "USD"
    }

    private let preferences = Data("""
        {"currency":"EUR","currencies":[{"code":"EUR","name":"Euro","symbol":"€","decimals":2}]}
        """.utf8)
    private let wheels = Data("""
        {"wheels":[{"id":"test","name":"Test","credit":"Test","categories":[
          {"name":"Sweet","groups":[{"name":null,"descriptors":[{"key":"test/sweet","label":"Server label"}]}]}
        ]}]}
        """.utf8)

    func testSignOutClearsReferenceDataAndRotatesCacheIdentity() async {
        StubURLProtocol.reply = preferences
        await session.loadPreferences()
        StubURLProtocol.reply = wheels
        await session.loadWheels()
        XCTAssertEqual(session.currency, "EUR")
        XCTAssertEqual(session.flavorName("test/sweet"), "Server label")
        let previous = session.id
        session.signOut()
        XCTAssertNotEqual(session.id, previous)
        XCTAssertEqual(session.currency, "USD")
        XCTAssertTrue(session.currencies.isEmpty)
        XCTAssertTrue(session.wheels.isEmpty)
        XCTAssertEqual(session.flavorName("test/sweet"), "Sweet")
    }

    func testOldPreferenceResponseCannotRepopulateSignedOutSession() async throws {
        StubURLProtocol.reply = preferences
        StubURLProtocol.delays = [0.1]
        let load = Task { await session.loadPreferences() }
        // Wait until the request is in flight, rather than relying on scheduler order.
        for _ in 0..<100 where StubURLProtocol.sent.isEmpty {
            try await Task.sleep(for: .milliseconds(5))
        }
        XCTAssertFalse(StubURLProtocol.sent.isEmpty)
        session.signOut()
        await load.value
        XCTAssertEqual(session.currency, "USD")
        XCTAssertTrue(session.currencies.isEmpty)
    }

    func testOldWheelResponseCannotPopulateAnotherServer() async throws {
        StubURLProtocol.reply = wheels
        StubURLProtocol.delays = [0.1]
        let load = Task { await session.loadWheels() }
        for _ in 0..<100 where StubURLProtocol.sent.isEmpty {
            try await Task.sleep(for: .milliseconds(5))
        }
        XCTAssertFalse(StubURLProtocol.sent.isEmpty)
        session.saveServer(URL(string: "https://other-server.example")!)
        await load.value
        XCTAssertTrue(session.wheels.isEmpty)
        XCTAssertEqual(session.flavorName("test/sweet"), "Sweet")
        // A new load must not be skipped because of the old response.
        await session.loadWheels()
        XCTAssertEqual(session.flavorName("test/sweet"), "Server label")
    }
}
