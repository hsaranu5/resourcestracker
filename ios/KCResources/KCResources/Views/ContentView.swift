import CoreLocation
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: ResourceStore
    @EnvironmentObject private var locationManager: LocationManager

    @AppStorage("radiusMiles") private var radiusMiles: Double = 5
    @AppStorage("splitFraction") private var splitFraction: Double = 0.45

    @State private var selectedID: String?
    @State private var selectedCategories: Set<ResourceCategory> = []
    @State private var searchText = ""
    @State private var detailResource: Resource?
    @State private var dragOffset: CGFloat = 0
    @State private var recenterToken = 0
    @State private var showingLocationDeniedAlert = false

    private let minFraction = 0.25
    private let maxFraction = 0.75

    private var results: [RankedResource] {
        store.ranked(
            near: locationManager.location,
            radiusMiles: radiusMiles,
            categories: selectedCategories,
            searchText: searchText
        )
    }

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                let available = proxy.size.height
                let mapHeight = clampedMapHeight(in: available)

                VStack(spacing: 0) {
                    ResourceMapView(
                        results: results,
                        userLocation: locationManager.location,
                        radiusMiles: radiusMiles,
                        selectedID: $selectedID,
                        recenterToken: recenterToken
                    )
                    .frame(height: mapHeight)
                    .overlay(alignment: .topTrailing) { mapOverlayControls }

                    splitHandle(available: available)

                    ResourceListView(
                        results: results,
                        selectedID: $selectedID,
                        hasUserLocation: locationManager.location != nil,
                        onOpenDetail: { detailResource = $0 }
                    )
                    .frame(maxHeight: .infinity)
                }
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("KC Resources")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: "Search name, service, or ZIP")
            .safeAreaInset(edge: .top, spacing: 0) {
                FilterBar(
                    selectedCategories: $selectedCategories,
                    radiusMiles: $radiusMiles,
                    resultCount: results.count
                )
            }
            .sheet(item: $detailResource) { resource in
                ResourceDetailSheet(
                    resource: resource,
                    distanceMiles: distance(for: resource)
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .alert("Location is turned off", isPresented: $showingLocationDeniedAlert) {
                Button("Open Settings") { locationManager.openSystemSettings() }
                Button("Not now", role: .cancel) { }
            } message: {
                Text("Turn on location access to sort resources by how close they are. You can still browse everything without it.")
            }
            .task { locationManager.requestAccess() }
        }
    }

    // MARK: - Pieces

    private var mapOverlayControls: some View {
        VStack(spacing: 8) {
            Button(action: locateTapped) {
                Group {
                    if locationManager.isAwaitingFix {
                        ProgressView()
                    } else {
                        Image(systemName: locationIconName)
                            .font(.system(size: 15, weight: .semibold))
                    }
                }
                .frame(width: 38, height: 38)
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .foregroundStyle(locationManager.isDenied ? Color.secondary : Color.accentColor)
            .accessibilityLabel(locationAccessibilityLabel)

            if store.isGeocoding {
                ProgressView()
                    .frame(width: 38, height: 38)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityLabel("Looking up addresses")
            }
        }
        .padding(12)
    }

    private var locationIconName: String {
        if locationManager.isDenied { return "location.slash.fill" }
        return locationManager.location == nil ? "location" : "location.fill"
    }

    private var locationAccessibilityLabel: String {
        if locationManager.isDenied { return "Location is off. Open Settings to turn it on." }
        if locationManager.isAwaitingFix { return "Finding your location" }
        return "Centre the map on my location"
    }

    /// The locate button has three jobs depending on permission state: ask for
    /// access, send the user to Settings if they've refused, or centre the map.
    private func locateTapped() {
        if locationManager.isDenied {
            showingLocationDeniedAlert = true
            return
        }
        if !locationManager.isAuthorized {
            locationManager.requestAccess()
            recenterToken += 1   // centre as soon as the first fix lands
            return
        }
        locationManager.refreshNow()
        recenterToken += 1
    }

    private func splitHandle(available: CGFloat) -> some View {
        ZStack {
            Rectangle()
                .fill(Color(.systemBackground))
            Capsule()
                .fill(Color.secondary.opacity(0.4))
                .frame(width: 40, height: 5)
        }
        .frame(height: 22)
        .overlay(alignment: .top) { Divider() }
        .contentShape(Rectangle())
        .gesture(
            DragGesture()
                .onChanged { value in dragOffset = value.translation.height }
                .onEnded { _ in
                    let newFraction = (clampedMapHeight(in: available)) / available
                    splitFraction = min(max(newFraction, minFraction), maxFraction)
                    dragOffset = 0
                }
        )
        .accessibilityLabel("Resize map")
        .accessibilityHint("Drag up or down to change how much of the screen the map uses")
    }

    private func clampedMapHeight(in available: CGFloat) -> CGFloat {
        let base = available * splitFraction + dragOffset
        return min(max(base, available * minFraction), available * maxFraction)
    }

    private func distance(for resource: Resource) -> Double? {
        results.first { $0.resource.id == resource.id }?.distanceMiles
    }
}

#Preview {
    ContentView()
        .environmentObject(ResourceStore())
        .environmentObject(LocationManager())
}
