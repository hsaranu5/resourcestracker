import Foundation

/// Points the app at the Express backend in `/server` — the same server the
/// website runs on. Everything (resources, community events, posts) comes from
/// one place; the bundled JSON in Resources/ is only the offline fallback.
enum ServerConfig {

    // ═════════════════════════════════════════════════════════════════════
    //  EDIT HERE — where the iOS app gets its server info from.
    //
    //  Exactly one line should be active. Options, in the order you'll
    //  likely use them:
    //
    //  1. Simulator on the same Mac as `npm run dev` / `npm run prod`:
    //     static let baseURLString = "http://localhost:5001"
    //
    //  2. Real device, same Wi-Fi as your Mac (use your Mac's LAN IP;
    //     plain http needs the ATS exception already in Info.plist):
    //     static let baseURLString = "http://192.168.1.20:5001"
    //
    //  3. Tailscale Funnel — works from anywhere, https, no ATS exception
    //     needed. Get the hostname from `tailscale funnel status`:
    //     static let baseURLString = "https://YOUR-MAC.YOUR-TAILNET.ts.net"
    //
    //  4. Real domain later — swap in and delete the funnel line:
    //     static let baseURLString = "https://resources.example.org"
    //
    //  5. Fully offline (bundled dataset only, no network):
    //     static let baseURLString = ""
    // ═════════════════════════════════════════════════════════════════════

    static let baseURLString = "http://localhost:5001"

    static var baseURL: URL? {
        guard !baseURLString.isEmpty else { return nil }
        return URL(string: baseURLString)
    }

    static var isConfigured: Bool { baseURL != nil }

    /// Full dataset in the app's payload shape.
    static var resourcesURL: URL? {
        baseURL?.appendingPathComponent("api/resources/export")
    }

    /// Auth endpoint URL, e.g. path "request-code", "verify", "me", "logout".
    static func authURL(path: String) -> URL? {
        baseURL?.appendingPathComponent("api/auth/\(path)")
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
