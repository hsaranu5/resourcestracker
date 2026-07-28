import SwiftUI

@main
struct KCResourcesApp: App {
    @StateObject private var store = ResourceStore()
    @StateObject private var community = CommunityStore()
    @StateObject private var locationManager = LocationManager()
    @StateObject private var session = OrgSession()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(community)
                .environmentObject(locationManager)
                .environmentObject(session)
                .task {
                    // Fill in any coordinates the dataset shipped without.
                    // Cached after the first run, so this is a no-op on later launches.
                    await store.geocodeMissingIfNeeded()
                    // Confirm a saved org session is still valid, if we hold one.
                    await session.restore()
                    if ServerConfig.isConfigured {
                        // Location caps the offline copy to ~15 mi (see
                        // ResourceStore.offlineCacheRadiusMiles).
                        await store.syncFromServer(near: locationManager.location)
                    }
                }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                // Never leave the location radio running once we're out of the foreground.
                locationManager.resume()
                // Coming back after a while, the events feed is the thing most
                // likely to have changed underneath us.
                if community.isStale {
                    Task { await community.refresh() }
                }
            case .background, .inactive:
                locationManager.pause()
            @unknown default:
                break
            }
        }
    }
}
