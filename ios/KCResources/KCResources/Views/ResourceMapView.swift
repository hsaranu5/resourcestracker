import CoreLocation
import MapKit
import SwiftUI

struct ResourceMapView: View {
    let results: [RankedResource]
    let userLocation: CLLocation?
    let radiusMiles: Double
    @Binding var selectedID: String?
    /// Incremented by the locate button. Any change means "centre on the user now",
    /// even if their coordinate is identical to last time.
    let recenterToken: Int

    @State private var camera: MapCameraPosition = .region(Self.defaultRegion)
    /// Set when a recenter is asked for before we have a fix, so we can honour it
    /// as soon as one arrives.
    @State private var awaitingRecenter = false

    /// Downtown KC, roughly midway between the Missouri and Kansas sides.
    private static let defaultRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 39.0997, longitude: -94.5786),
        span: MKCoordinateSpan(latitudeDelta: 0.35, longitudeDelta: 0.35)
    )

    private var pins: [RankedResource] {
        results.filter { $0.resource.coordinate != nil }
    }

    /// Co-located resources, grouped so one building yields one pin.
    ///
    /// Roughly a quarter of the dataset shares an address with something else —
    /// True Light runs four separate programmes out of 717 E 31st, and several
    /// buildings host both a meal service and a clinic. Rendered as individual
    /// annotations they stack exactly on top of each other, and only the topmost
    /// is tappable, so the rest are invisible and unreachable.
    private var clusters: [PinCluster] {
        PinCluster.group(pins)
    }

    var body: some View {
        Map(position: $camera) {
            UserAnnotation()

            if let userLocation {
                MapCircle(center: userLocation.coordinate, radius: radiusMiles * 1609.344)
                    .foregroundStyle(Color.accentColor.opacity(0.08))
                    .stroke(Color.accentColor.opacity(0.35), lineWidth: 1)
            }

            ForEach(clusters) { cluster in
                Annotation(
                    cluster.members.first?.resource.name ?? "",
                    coordinate: cluster.coordinate,
                    anchor: .bottom
                ) {
                    ClusterPinView(
                        cluster: cluster,
                        selectedID: selectedID
                    )
                    .onTapGesture {
                        withAnimation(.snappy) {
                            selectedID = cluster.nextSelection(after: selectedID)
                        }
                    }
                }
                .annotationTitles(.hidden)
            }
        }
        .mapControls {
            MapCompass()
            MapScaleView()
        }
        .onChange(of: selectedID) { _, newValue in
            guard let newValue,
                  let coordinate = pins.first(where: { $0.id == newValue })?.resource.coordinate
            else { return }
            withAnimation(.easeInOut(duration: 0.35)) {
                camera = .region(
                    MKCoordinateRegion(
                        center: coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
                    )
                )
            }
        }
        .onChange(of: userLocation?.coordinate.latitude) { _, _ in
            guard let userLocation else { return }
            // An explicit request wins even if something is selected.
            if awaitingRecenter {
                awaitingRecenter = false
                centre(on: userLocation)
                return
            }
            // Otherwise follow the user only while nothing is selected, so we never
            // yank the map away from a pin someone is reading.
            guard selectedID == nil else { return }
            centre(on: userLocation)
        }
        .onChange(of: recenterToken) { _, _ in
            guard let userLocation else {
                // No fix yet — remember the request and honour it when one lands.
                awaitingRecenter = true
                return
            }
            selectedID = nil
            centre(on: userLocation)
        }
    }

    /// Frames the search radius with a little margin around it.
    private func centre(on location: CLLocation) {
        let meters = radiusMiles * 1609.344 * 2.4
        withAnimation(.easeInOut(duration: 0.4)) {
            camera = .region(
                MKCoordinateRegion(
                    center: location.coordinate,
                    latitudinalMeters: meters,
                    longitudinalMeters: meters
                )
            )
        }
    }
}

// MARK: - Clustering

/// A group of resources that share (very nearly) the same coordinate.
struct PinCluster: Identifiable {
    let coordinate: CLLocationCoordinate2D
    let members: [RankedResource]

    /// Stable across redraws because it's derived from the members, not from
    /// array position — otherwise SwiftUI would tear down annotations whenever
    /// filtering changed the ordering.
    let id: String

    var count: Int { members.count }
    var isCluster: Bool { count > 1 }

    /// ~11 m at this latitude. Tight enough that only genuine same-building
    /// entries merge, loose enough to absorb geocoder jitter between two
    /// lookups of the same address.
    private static let precision = 4

    static func group(_ pins: [RankedResource]) -> [PinCluster] {
        var buckets: [String: [RankedResource]] = [:]
        var order: [String] = []

        for pin in pins {
            guard let c = pin.resource.coordinate else { continue }
            let key = String(format: "%.\(precision)f,%.\(precision)f", c.latitude, c.longitude)
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: []].append(pin)
        }

        return order.compactMap { key in
            guard let members = buckets[key], let first = members.first,
                  let coordinate = first.resource.coordinate else { return nil }
            // Sort for a predictable cycling order when tapping repeatedly.
            let sorted = members.sorted { $0.resource.name < $1.resource.name }
            let id = sorted.map(\.id).joined(separator: "|")
            return PinCluster(coordinate: coordinate, members: sorted, id: id)
        }
    }

    /// Which member is currently selected, if any.
    var selectedIndex: Int? {
        get { nil }
    }

    func index(of id: String?) -> Int? {
        guard let id else { return nil }
        return members.firstIndex { $0.id == id }
    }

    /// Tapping cycles through everything at this address, then clears.
    ///
    /// A stack of four needs five taps to get back to nothing, which is a little
    /// laborious — but every entry is reachable, and the list below scrolls to
    /// whichever is selected, so the detail is always visible.
    func nextSelection(after current: String?) -> String? {
        guard let currentIndex = index(of: current) else {
            return members.first?.id
        }
        let next = currentIndex + 1
        return next < members.count ? members[next].id : nil
    }

    /// The category colour to draw. When something here is selected we show its
    /// category; otherwise the first member's.
    func tintCategory(for selectedID: String?) -> ResourceCategory {
        if let i = index(of: selectedID) { return members[i].resource.category }
        return members.first?.resource.category ?? .support
    }
}

// MARK: - Pins

private struct ClusterPinView: View {
    let cluster: PinCluster
    let selectedID: String?

    private var isSelected: Bool { cluster.index(of: selectedID) != nil }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            PinView(
                category: cluster.tintCategory(for: selectedID),
                symbol: cluster.isCluster && !isSelected
                    ? "square.stack.3d.up.fill"
                    : cluster.tintCategory(for: selectedID).symbol,
                isSelected: isSelected
            )

            if cluster.isCluster {
                // The badge is what tells someone there's more than one service
                // here — without it a stacked pin is indistinguishable.
                Text("\(cluster.count)")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(minWidth: 16, minHeight: 16)
                    .background(Circle().fill(Color.black.opacity(0.75)))
                    .overlay(Circle().strokeBorder(.white, lineWidth: 1.5))
                    .offset(x: 6, y: -4)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }

    private var accessibilityLabel: String {
        guard cluster.isCluster else {
            return cluster.members.first?.resource.name ?? "Resource"
        }
        if let i = cluster.index(of: selectedID) {
            return "\(cluster.members[i].resource.name), \(i + 1) of \(cluster.count) at this address"
        }
        return "\(cluster.count) services at this address. Double tap to step through them."
    }
}

private struct PinView: View {
    let category: ResourceCategory
    let symbol: String
    let isSelected: Bool

    private var diameter: CGFloat { isSelected ? 38 : 26 }

    var body: some View {
        ZStack {
            Circle()
                .fill(category.tint)
                .frame(width: diameter, height: diameter)
                .shadow(color: .black.opacity(0.25), radius: isSelected ? 6 : 2, y: 1)

            Circle()
                .strokeBorder(.white, lineWidth: isSelected ? 3 : 2)
                .frame(width: diameter, height: diameter)

            Image(systemName: symbol)
                .font(.system(size: isSelected ? 16 : 11, weight: .bold))
                .foregroundStyle(.white)
        }
        .animation(.snappy(duration: 0.2), value: isSelected)
    }
}
