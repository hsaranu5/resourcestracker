import CoreLocation
import MapKit
import UIKit

/// Hands a resource's location off to a navigation app.
enum DirectionsService {

    enum Provider: String, CaseIterable, Identifiable {
        case apple
        case google

        var id: String { rawValue }

        var title: String {
            switch self {
            case .apple: return "Apple Maps"
            case .google: return "Google Maps"
            }
        }

        var symbol: String {
            switch self {
            case .apple: return "map.fill"
            case .google: return "globe.americas.fill"
            }
        }

        /// Google Maps only appears in the UI when the app is actually installed;
        /// otherwise we'd bounce the user to a web page they may not be able to load.
        var isAvailable: Bool {
            switch self {
            case .apple:
                return true
            case .google:
                guard let url = URL(string: "comgooglemaps://") else { return false }
                return UIApplication.shared.canOpenURL(url)
            }
        }
    }

    static var availableProviders: [Provider] {
        Provider.allCases.filter(\.isAvailable)
    }

    static func open(_ resource: Resource, using provider: Provider) {
        switch provider {
        case .apple:
            openInAppleMaps(resource)
        case .google:
            openInGoogleMaps(resource)
        }
    }

    private static func openInAppleMaps(_ resource: Resource) {
        let options: [String: Any] = [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
        ]

        if let coordinate = resource.coordinate {
            let placemark = MKPlacemark(coordinate: coordinate)
            let item = MKMapItem(placemark: placemark)
            item.name = resource.name
            item.openInMaps(launchOptions: options)
            return
        }

        // No coordinate — fall back to a text search for the address.
        guard let encoded = resource.fullAddress.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "http://maps.apple.com/?daddr=\(encoded)&dirflg=d")
        else { return }
        UIApplication.shared.open(url)
    }

    private static func openInGoogleMaps(_ resource: Resource) {
        let destination: String
        if let coordinate = resource.coordinate {
            destination = "\(coordinate.latitude),\(coordinate.longitude)"
        } else {
            destination = resource.fullAddress
        }
        guard let encoded = destination.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return }

        if let appURL = URL(string: "comgooglemaps://?daddr=\(encoded)&directionsmode=driving"),
           UIApplication.shared.canOpenURL(appURL) {
            UIApplication.shared.open(appURL)
            return
        }
        if let webURL = URL(string: "https://www.google.com/maps/dir/?api=1&destination=\(encoded)") {
            UIApplication.shared.open(webURL)
        }
    }

    static func call(_ resource: Resource) {
        guard let number = resource.dialableNumber,
              let url = URL(string: "tel://\(number)"),
              UIApplication.shared.canOpenURL(url) else { return }
        UIApplication.shared.open(url)
    }

    static func openWebsite(_ resource: Resource) {
        guard !resource.website.isEmpty, let url = URL(string: resource.website) else { return }
        UIApplication.shared.open(url)
    }
}
