import Foundation

/// A refresh supersedes every earlier request. Page numbers advance only after success.
struct PageLoadState {
    struct Request: Equatable {
        fileprivate let id = UUID()
        let page: Int
    }

    private var active: Request?
    private var page = 0
    private var pageCount = 0

    mutating func invalidate() {
        active = nil
        page = 0
        pageCount = 0
    }

    mutating func reload() -> Request {
        invalidate()
        let request = Request(page: 1)
        active = request
        return request
    }

    mutating func next() -> Request? {
        guard active == nil, page > 0, page < pageCount else { return nil }
        let request = Request(page: page + 1)
        active = request
        return request
    }

    func isCurrent(_ request: Request) -> Bool { active == request }

    mutating func finish(_ request: Request, pageCount: Int) -> Bool {
        guard isCurrent(request) else { return false }
        page = request.page
        self.pageCount = pageCount
        active = nil
        return true
    }

    mutating func fail(_ request: Request) -> Bool {
        guard isCurrent(request) else { return false }
        active = nil
        return true
    }
}
