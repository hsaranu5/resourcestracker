import Combine
import CoreLocation
import Foundation

/// Date parsing for server payloads.
///
/// This lives outside `CommunityStore` on purpose. The store is `@MainActor`, but
/// `JSONDecoder.dateDecodingStrategy` takes a `Sendable` closure that runs off the
/// main actor — so it can't reach actor-isolated statics.
///
/// `ISO8601DateFormatter` isn't marked `Sendable` in the SDK, so those two need
/// `nonisolated(unsafe)`. It's accurate rather than a workaround: both are written
/// once at creation, only ever read afterwards, and Foundation's date parsing is
/// thread-safe. `DateFormatter` *is* declared `Sendable`, so it needs no annotation.
private enum ServerDate {

    nonisolated(unsafe) static let isoWithFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) static let isoPlain = ISO8601DateFormatter()

    /// SQLite's CURRENT_TIMESTAMP writes "YYYY-MM-DD HH:MM:SS" in UTC.
    static let sqlite: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        f.timeZone = TimeZone(identifier: "UTC")
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// The server mixes formats depending on whether a row was written by our
    /// code (ISO, sometimes with fractional seconds) or by SQLite itself.
    static func parse(_ raw: String) -> Date? {
        isoWithFraction.date(from: raw)
            ?? isoPlain.date(from: raw)
            ?? sqlite.date(from: raw)
    }
}

/// Loads events and posts from the server, caches them to disk, and is explicit
/// about how old the cached copy is.
///
/// Staleness matters more here than for the resource list. A resource's hours are
/// stable for months; an event is a claim about a specific afternoon. Showing a
/// three-day-old event feed without saying so could send someone to a car park.
@MainActor
final class CommunityStore: ObservableObject {

    @Published private(set) var events: [CommunityEvent] = []
    @Published private(set) var posts: [CommunityPost] = []
    @Published private(set) var isLoading = false
    @Published private(set) var lastUpdated: Date?
    @Published private(set) var loadError: String?
    /// True when what's on screen came from the app bundle rather than a server.
    @Published private(set) var isShowingBundledData = false

    /// Past this age we tell the user the feed may be out of date.
    private let stalenessThreshold: TimeInterval = 6 * 60 * 60

    private let eventsCacheURL: URL
    private let postsCacheURL: URL
    private let metaKey = "communityLastUpdated"

    private lazy var decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            guard let date = ServerDate.parse(raw) else {
                throw DecodingError.dataCorrupted(
                    .init(codingPath: decoder.codingPath, debugDescription: "Unrecognised date: \(raw)")
                )
            }
            return date
        }
        return decoder
    }()

    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        eventsCacheURL = dir.appendingPathComponent("community-events.json")
        postsCacheURL = dir.appendingPathComponent("community-posts.json")
        loadFromCache()
    }

    // MARK: - Staleness

    var isStale: Bool {
        guard let lastUpdated else { return !events.isEmpty || !posts.isEmpty }
        return Date().timeIntervalSince(lastUpdated) > stalenessThreshold
    }

    var hasEverLoaded: Bool { lastUpdated != nil }

    /// Human-readable freshness for the header, e.g. "Updated 20 minutes ago".
    var freshnessText: String {
        guard let lastUpdated else { return "Not updated yet" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return "Updated \(formatter.localizedString(for: lastUpdated, relativeTo: Date()))"
    }

    // MARK: - Cache

    /// Prefer a previously downloaded copy, otherwise fall back to what shipped
    /// with the app.
    ///
    /// Bundling events matters more than it might seem: it means the Community
    /// tab works with no server, no network, and no configuration. Someone on a
    /// dead connection still sees this week's clinics, and a demo doesn't depend
    /// on a laptop staying reachable.
    private func loadFromCache() {
        if let data = try? Data(contentsOf: eventsCacheURL),
           let payload = try? decoder.decode(EventsPayload.self, from: data) {
            events = payload.events
        } else if let payload: EventsPayload = decodeBundled("events") {
            events = payload.events
            isShowingBundledData = true
        }

        if let data = try? Data(contentsOf: postsCacheURL),
           let payload = try? decoder.decode(PostsPayload.self, from: data) {
            posts = payload.posts
        } else if let payload: PostsPayload = decodeBundled("posts") {
            posts = payload.posts
        }

        if let stamp = UserDefaults.standard.object(forKey: metaKey) as? Date {
            lastUpdated = stamp
        }
    }

    private func decodeBundled<T: Decodable>(_ name: String) -> T? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            // Worth surfacing in the console: a malformed bundled file would
            // otherwise look identical to "no data".
            print("Failed to decode bundled \(name).json: \(error)")
            return nil
        }
    }

    // MARK: - Fetching

    func refresh(near location: CLLocation? = nil, radiusMiles: Double? = nil) async {
        // With no server configured the bundled data is the whole story — that's a
        // valid mode, not an error, so don't nag about it.
        guard ServerConfig.isConfigured else { return }

        isLoading = true
        loadError = nil
        defer { isLoading = false }

        async let fetchedEvents = loadEvents(near: location, radiusMiles: radiusMiles)
        async let fetchedPosts = loadPosts()

        let (eventResult, postResult) = await (fetchedEvents, fetchedPosts)

        var failures: [String] = []

        switch eventResult {
        case .success(let payload):
            events = payload.events
            isShowingBundledData = false
        case .failure(let message):
            failures.append(message)
        }

        switch postResult {
        case .success(let payload):
            posts = payload.posts
        case .failure(let message):
            failures.append(message)
        }

        // Only stamp as updated if at least one half succeeded, so the freshness
        // label never overstates what we actually have.
        if failures.count < 2 {
            lastUpdated = Date()
            UserDefaults.standard.set(lastUpdated, forKey: metaKey)
        }
        if !failures.isEmpty {
            loadError = events.isEmpty && posts.isEmpty
                ? "Couldn't reach the server."
                : "Couldn't fully refresh — showing what we have saved."
        }
    }

    private enum FetchResult<T> {
        case success(T)
        case failure(String)
    }

    private func loadEvents(near location: CLLocation?, radiusMiles: Double?) async -> FetchResult<EventsPayload> {
        guard var components = ServerConfig.communityURL(path: "events") else {
            return .failure("Bad server URL")
        }
        if let location, let radiusMiles {
            components.queryItems = [
                URLQueryItem(name: "lat", value: String(location.coordinate.latitude)),
                URLQueryItem(name: "lng", value: String(location.coordinate.longitude)),
                URLQueryItem(name: "radius", value: String(radiusMiles))
            ]
        }
        guard let url = components.url else { return .failure("Bad server URL") }

        do {
            let data = try await fetch(url)
            let payload = try decoder.decode(EventsPayload.self, from: data)
            try? data.write(to: eventsCacheURL, options: .atomic)
            return .success(payload)
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    private func loadPosts() async -> FetchResult<PostsPayload> {
        guard let url = ServerConfig.communityURL(path: "posts")?.url else {
            return .failure("Bad server URL")
        }
        do {
            let data = try await fetch(url)
            let payload = try decoder.decode(PostsPayload.self, from: data)
            try? data.write(to: postsCacheURL, options: .atomic)
            return .success(payload)
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    private func fetch(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    // MARK: - Publishing (verified orgs only)

    /// A field-level validation or server error, surfaced to the composer.
    struct PublishError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// Posts a new event. `token` comes from `OrgSession`; the server derives the
    /// organisation from the session, so the client never sends it.
    func createEvent(_ body: [String: Any], token: String) async throws {
        guard let url = ServerConfig.communityURL(path: "events")?.url else {
            throw PublishError(message: "No server is configured.")
        }
        try await publish(url, body: body, token: token)
        await refresh()
    }

    func createPost(_ body: [String: Any], token: String) async throws {
        guard let url = ServerConfig.communityURL(path: "posts")?.url else {
            throw PublishError(message: "No server is configured.")
        }
        try await publish(url, body: body, token: token)
        await refresh()
    }

    private func publish(_ url: URL, body: [String: Any], token: String) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 20

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw PublishError(message: "No response from the server.")
        }
        guard (200..<300).contains(http.statusCode) else {
            // Surface the server's own validation message where we can — it's
            // more specific than anything we'd invent ("endsAt cannot be before
            // startsAt", "Session expired. Sign in again.").
            let serverMessage = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            if http.statusCode == 401 {
                throw PublishError(message: serverMessage ?? "Your session expired. Sign in again.")
            }
            throw PublishError(message: serverMessage ?? "Couldn't publish (error \(http.statusCode)).")
        }
    }

    // MARK: - Querying

    /// Upcoming and in-progress events, grouped by day. Events that have finished
    /// drop off; cancelled ones stay so people who planned around them find out.
    func upcomingByDay(categories: Set<ResourceCategory> = []) -> [EventDay] {
        let filtered = events.filter { event in
            guard !event.isOver || event.isHappeningNow else { return false }
            guard categories.isEmpty || categories.contains(event.category) else { return false }
            return true
        }
        return EventDay.group(filtered)
    }

    var sortedPosts: [CommunityPost] {
        posts.sorted { lhs, rhs in
            if lhs.pinned != rhs.pinned { return lhs.pinned }
            return lhs.createdAt > rhs.createdAt
        }
    }
}
