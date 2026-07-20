import SwiftUI

/// Three tabs: find something now, see what's happening, adjust settings.
///
/// The map stays first because the urgent case — "I need food today" — should
/// never be more than one tap from launch.
struct RootView: View {
    enum Tab: String {
        case map
        case community
        case settings
    }

    @State private var selection: Tab = .map

    var body: some View {
        TabView(selection: $selection) {
            ContentView()
                .tabItem { Label("Find", systemImage: "map.fill") }
                .tag(Tab.map)

            CommunityView()
                .tabItem { Label("Community", systemImage: "calendar") }
                .tag(Tab.community)

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
                .tag(Tab.settings)
        }
    }
}
