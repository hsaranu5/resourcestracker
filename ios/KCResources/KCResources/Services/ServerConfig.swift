import Foundation

/// Points the app at the Express backend in `/server`.
///
/// Leave `baseURLString` empty to run fully offline against the bundled dataset.
/// For the simulator talking to a server on the same Mac, use http://localhost:5001.
/// For a device on the same Wi-Fi, use your Mac's LAN IP, e.g. http://192.168.1.20:5001.
///
/// Note: plain http to a non-localhost host requires an App Transport Security
/// exception — see the NSAppTransportSecurity block in Info.plist, which is scoped
/// to local networking only. Use https in production.
enum ServerConfig {

    static let baseURLString = ""

    static var baseURL: URL? {
        guard !baseURLString.isEmpty else { return nil }
        return URL(string: baseURLString)
    }

    static var isConfigured: Bool { baseURL != nil }

    /// Full dataset in the app's payload shape.
    static var resourcesURL: URL? {
        baseURL?.appendingPathComponent("api/resources/export")
    }

    /// Builds a community endpoint URL, e.g. path "events" or "posts".
    /// Returns components so callers can attach their own query items.
    static func communityURL(path: String) -> URLComponents? {
        guard let baseURL else { return nil }
        return URLComponents(
            url: baseURL.appendingPathComponent("api/community/\(path)"),
            resolvingAgainstBaseURL: false
        )
    }

    /// Server-side proximity query, used by `Nearby` when you'd rather not ship
    /// the whole dataset to the device.
    static func nearbyURL(latitude: Double, longitude: Double, radiusMiles: Double) -> URL? {
        guard let baseURL else { return nil }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/resources/nearby"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "lat", value: String(latitude)),
            URLQueryItem(name: "lng", value: String(longitude)),
            URLQueryItem(name: "radius", value: String(radiusMiles)),
        ]
        return components?.url
    }
}
