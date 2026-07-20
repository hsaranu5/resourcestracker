import CoreLocation
import Foundation
import UIKit

/// Battery-conscious location provider.
///
/// The app never needs street-level precision — it only ranks resources by rough
/// distance — so we ask for 100 m accuracy and only accept a new fix once the user
/// has moved 100 m *and* at least `minimumInterval` seconds have passed. In
/// `.once` mode we take a single fix and immediately stop the hardware.
@MainActor
final class LocationManager: NSObject, ObservableObject {

    enum Mode: String, CaseIterable, Identifiable {
        case once
        case periodic

        var id: String { rawValue }

        var title: String {
            switch self {
            case .once: return "Once"
            case .periodic: return "Keep updating"
            }
        }

        var detail: String {
            switch self {
            case .once: return "Checks your location a single time. Uses the least battery."
            case .periodic: return "Refreshes about every 10 seconds while the app is open."
            }
        }
    }

    @Published private(set) var location: CLLocation?
    @Published private(set) var authorizationStatus: CLAuthorizationStatus
    @Published private(set) var isUpdating = false
    /// True between asking for a fix and getting one, so the UI can show a spinner
    /// instead of looking unresponsive.
    @Published private(set) var isAwaitingFix = false
    @Published var mode: Mode = .once {
        didSet { modeChanged() }
    }

    /// Floor on how often we publish a new fix, in seconds.
    private let minimumInterval: TimeInterval = 10

    private let manager = CLLocationManager()
    private var lastPublished: Date?

    var isAuthorized: Bool {
        authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways
    }

    var isDenied: Bool {
        authorizationStatus == .denied || authorizationStatus == .restricted
    }

    override init() {
        authorizationStatus = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 100
        manager.pausesLocationUpdatesAutomatically = true
    }

    func requestAccess() {
        switch authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            start()
        default:
            break
        }
    }

    func start() {
        guard isAuthorized else { return }
        switch mode {
        case .once:
            isAwaitingFix = true
            manager.requestLocation()
        case .periodic:
            isUpdating = true
            manager.startUpdatingLocation()
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
        isUpdating = false
    }

    /// Called when the app leaves the foreground — never keep the radio on in the background.
    func pause() {
        if isUpdating { manager.stopUpdatingLocation() }
    }

    func resume() {
        guard isAuthorized else { return }
        if mode == .periodic {
            manager.startUpdatingLocation()
            isUpdating = true
        }
    }

    func refreshNow() {
        guard isAuthorized else { return requestAccess() }
        lastPublished = nil   // bypass the throttle; this is an explicit user request
        isAwaitingFix = true
        manager.requestLocation()
    }

    /// Opens the system Settings page for this app, so someone who denied
    /// location access has a way back without hunting for it themselves.
    func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    private func modeChanged() {
        stop()
        start()
    }
}

extension LocationManager: CLLocationManagerDelegate {

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let newest = locations.last else { return }
        Task { @MainActor in
            // Throttle: ignore fixes that arrive sooner than our minimum interval.
            if mode == .periodic, let last = lastPublished,
               Date().timeIntervalSince(last) < minimumInterval {
                return
            }
            // Reject stale or wildly inaccurate fixes.
            guard newest.horizontalAccuracy >= 0, newest.horizontalAccuracy < 1000 else { return }
            guard abs(newest.timestamp.timeIntervalSinceNow) < 60 else { return }

            lastPublished = Date()
            location = newest
            isAwaitingFix = false

            if mode == .once { manager.stopUpdatingLocation() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            // Always clear the spinner, or the button stays stuck looking busy.
            isAwaitingFix = false
            // A transient "unknown location" is normal indoors; keep the last good fix.
            // In the simulator this is what you get when no location is simulated at all.
            if (error as? CLError)?.code == .locationUnknown { return }
            isUpdating = false
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            authorizationStatus = status
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                start()
            } else {
                location = nil
                isUpdating = false
                isAwaitingFix = false   // otherwise the locate button spins forever
            }
        }
    }
}
