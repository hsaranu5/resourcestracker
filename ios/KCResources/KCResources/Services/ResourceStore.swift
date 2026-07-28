import Combine
import CoreLocation
import Foundation

/// Owns the resource dataset: loads the bundled JSON, fills in any missing
/// coordinates via CLGeocoder (cached to disk so it happens at most once),
/// and optionally refreshes from the Express backend when one is configured.
@MainActor
final class ResourceStore: ObservableObject {

    @Published private(set) var resources: [Resource] = []
    @Published private(set) var isGeocoding = false
    @Published private(set) var lastSync: Date?
    @Published private(set) var syncError: String?

    private let geocoder = CLGeocoder()
    private let cacheURL: URL
    private let remoteCacheURL: URL

    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        cacheURL = dir.appendingPathComponent("geocode-cache.json")
        remoteCacheURL = dir.appendingPathComponent("resources-remote.json")
        load()
    }

    // MARK: - Loading

    private func load() {
        // Prefer a previously downloaded copy from the server, fall back to the bundle.
        if let remote = decodePayload(at: remoteCacheURL) {
            resources = remote.resources
        } else if let bundled = loadBundled() {
            resources = bundled.resources
        } else {
            resources = []
        }
        applyGeocodeCache()
    }

    private func loadBundled() -> ResourcePayload? {
        guard let url = Bundle.main.url(forResource: "resources", withExtension: "json") else {
            assertionFailure("resources.json is missing from the app bundle")
            return nil
        }
        return decodePayload(at: url)
    }

    private func decodePayload(at url: URL) -> ResourcePayload? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(ResourcePayload.self, from: data)
    }

    // MARK: - Geocoding

    private struct CachedCoordinate: Codable {
        let latitude: Double
        let longitude: Double
    }

    private func applyGeocodeCache() {
        guard let data = try? Data(contentsOf: cacheURL),
              let cache = try? JSONDecoder().decode([String: CachedCoordinate].self, from: data)
        else { return }

        for i in resources.indices {
            guard resources[i].latitude == nil, let hit = cache[resources[i].id] else { continue }
            resources[i].latitude = hit.latitude
            resources[i].longitude = hit.longitude
        }
    }

    private func writeGeocodeCache() {
        var cache: [String: CachedCoordinate] = [:]
        for r in resources {
            if let lat = r.latitude, let lon = r.longitude {
                cache[r.id] = CachedCoordinate(latitude: lat, longitude: lon)
            }
        }
        if let data = try? JSONEncoder().encode(cache) {
            try? data.write(to: cacheURL, options: .atomic)
        }
    }

    /// Fills in coordinates for any mappable resource that doesn't have them.
    /// CLGeocoder is rate-limited, so requests are serialized with a small gap.
    /// Results are cached, so this normally only does real work on first launch.
    func geocodeMissingIfNeeded() async {
        let pending = resources.enumerated().filter { $0.element.mappable && $0.element.latitude == nil }
        guard !pending.isEmpty else { return }

        isGeocoding = true
        defer {
            isGeocoding = false
            writeGeocodeCache()
        }

        for (index, resource) in pending {
            do {
                let placemarks = try await geocoder.geocodeAddressString(resource.fullAddress)
                if let coordinate = placemarks.first?.location?.coordinate,
                   Self.isWithinKCMetro(coordinate) {
                    resources[index].latitude = coordinate.latitude
                    resources[index].longitude = coordinate.longitude
                }
            } catch {
                // A failed lookup just means no pin for this entry; the list row still works.
                continue
            }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
    }

    /// Guards against a geocoder returning a same-named street in another state.
    private static func isWithinKCMetro(_ c: CLLocationCoordinate2D) -> Bool {
        (38.6...39.5).contains(c.latitude) && (-95.1...(-94.2)).contains(c.longitude)
    }

    // MARK: - Optional server sync

    /// The offline copy saved to disk is trimmed to this radius around the
    /// user. A shop in California is useless to someone in Kansas — what's
    /// worth keeping on standby for a wifi outage is the walkable/drivable
    /// area. Entries with no coordinates (hotlines, text lines) always stay.
    static let offlineCacheRadiusMiles: Double = 15

    /// Pulls an updated dataset from the Express backend, if `ServerConfig.baseURL` is set.
    /// Failure is non-fatal — the cached/bundled data keeps working offline.
    ///
    /// The full dataset is used in memory for this session; what's *saved* for
    /// offline standby is capped to `offlineCacheRadiusMiles` of `location`
    /// (or uncapped when no location fix is available yet).
    func syncFromServer(near location: CLLocation? = nil) async {
        guard let url = ServerConfig.resourcesURL else { return }
        syncError = nil
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 15
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                syncError = "Server returned an unexpected response."
                return
            }
            let payload = try JSONDecoder().decode(ResourcePayload.self, from: data)
            guard !payload.resources.isEmpty else {
                syncError = "Server sent an empty dataset — keeping the current list."
                return
            }

            resources = payload.resources
            applyGeocodeCache()
            writeOfflineCache(payload, near: location)
            lastSync = Date()
            await geocodeMissingIfNeeded()
        } catch {
            syncError = "Couldn't reach the server. Showing saved resources."
        }
    }

    private func writeOfflineCache(_ payload: ResourcePayload, near location: CLLocation?) {
        var capped = payload
        if let location {
            capped.resources = payload.resources.filter { resource in
                guard let resourceLocation = resource.location else { return true }
                let miles = location.distance(from: resourceLocation) / 1609.344
                return miles <= Self.offlineCacheRadiusMiles
            }
        }
        if let data = try? JSONEncoder().encode(capped) {
            try? data.write(to: remoteCacheURL, options: .atomic)
        }
    }

    // MARK: - Querying

    /// Resources within `radiusMiles` of `location`, sorted nearest-first.
    /// Non-mappable entries (hotlines, mobile outreach) are always included at the
    /// end — someone who needs a crisis line shouldn't have it filtered out by distance.
    func ranked(
        near location: CLLocation?,
        radiusMiles: Double,
        categories: Set<ResourceCategory>,
        searchText: String
    ) -> [RankedResource] {

        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        let matching = resources.filter { resource in
            guard categories.isEmpty || categories.contains(resource.category) else { return false }
            guard !query.isEmpty else { return true }
            return resource.name.lowercased().contains(query)
                || resource.organization.lowercased().contains(query)
                || resource.services.contains { $0.lowercased().contains(query) }
                || resource.city.lowercased().contains(query)
                || resource.zipCode.contains(query)
        }

        var mapped: [RankedResource] = []
        var unmapped: [RankedResource] = []

        for resource in matching {
            guard let userLocation = location, let resourceLocation = resource.location else {
                // No user fix yet, or no coordinate for this entry: keep it, just unranked.
                let ranked = RankedResource(resource: resource, distanceMiles: nil)
                if resource.mappable { mapped.append(ranked) } else { unmapped.append(ranked) }
                continue
            }
            let miles = userLocation.distance(from: resourceLocation) / 1609.344
            if miles <= radiusMiles {
                mapped.append(RankedResource(resource: resource, distanceMiles: miles))
            }
        }

        mapped.sort { lhs, rhs in
            switch (lhs.distanceMiles, rhs.distanceMiles) {
            case let (l?, r?): return l < r
            case (nil, _?): return false
            case (_?, nil): return true
            default: return lhs.resource.name < rhs.resource.name
            }
        }
        unmapped.sort { $0.resource.name < $1.resource.name }

        return mapped + unmapped
    }
}
