import CoreLocation
import Foundation
import SwiftUI

// MARK: - Category

enum ResourceCategory: String, Codable, CaseIterable, Identifiable {
    case food
    case shelter
    case health
    case hygiene
    case crisis
    case youth
    case veterans
    case support

    var id: String { rawValue }

    var title: String {
        switch self {
        case .food: return "Food"
        case .shelter: return "Shelter"
        case .health: return "Health"
        case .hygiene: return "Showers"
        case .crisis: return "Crisis"
        case .youth: return "Youth"
        case .veterans: return "Veterans"
        case .support: return "Support"
        }
    }

    var symbol: String {
        switch self {
        case .food: return "fork.knife"
        case .shelter: return "house.fill"
        case .health: return "cross.case.fill"
        case .hygiene: return "shower.fill"
        case .crisis: return "phone.fill"
        case .youth: return "figure.2.and.child.holdinghands"
        case .veterans: return "shield.lefthalf.filled"
        case .support: return "hands.and.sparkles.fill"
        }
    }

    var tint: Color {
        switch self {
        case .food: return Color(red: 0.90, green: 0.49, blue: 0.13)
        case .shelter: return Color(red: 0.20, green: 0.45, blue: 0.78)
        case .health: return Color(red: 0.11, green: 0.62, blue: 0.44)
        case .hygiene: return Color(red: 0.24, green: 0.66, blue: 0.76)
        case .crisis: return Color(red: 0.78, green: 0.22, blue: 0.28)
        case .youth: return Color(red: 0.61, green: 0.35, blue: 0.71)
        case .veterans: return Color(red: 0.35, green: 0.40, blue: 0.55)
        case .support: return Color(red: 0.85, green: 0.33, blue: 0.53)
        }
    }
}

// MARK: - Resource

struct Resource: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let organization: String
    let category: ResourceCategory
    let services: [String]
    let description: String
    let address: String
    let city: String
    let state: String
    let zipCode: String
    let phone: String
    let website: String
    let hours: String
    let eligibility: String
    let verified: Bool
    let source: String
    /// False for hotlines, mobile outreach, and confidential shelters — these never get a map pin.
    let mappable: Bool

    var latitude: Double?
    var longitude: Double?

    var coordinate: CLLocationCoordinate2D? {
        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var location: CLLocation? {
        guard let latitude, let longitude else { return nil }
        return CLLocation(latitude: latitude, longitude: longitude)
    }

    /// Single-line address suitable for a Maps query.
    var fullAddress: String {
        [address, city, state, zipCode]
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    var cityState: String {
        [city, state].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    var hasPhone: Bool { !phone.isEmpty }

    /// Digits only, for `tel:` URLs. Preserves 988 and other short codes.
    var dialableNumber: String? {
        let digits = phone.filter(\.isNumber)
        return digits.isEmpty ? nil : digits
    }
}

// MARK: - Bundled payload

struct ResourcePayload: Codable {
    let version: Int
    let generated: String
    let region: String
    var resources: [Resource]
}

// MARK: - Distance-annotated view model

struct RankedResource: Identifiable, Hashable {
    let resource: Resource
    /// Miles from the user. Nil when we have no user location or no coordinate.
    let distanceMiles: Double?

    var id: String { resource.id }

    var distanceText: String? {
        guard let distanceMiles else { return nil }
        if distanceMiles < 0.1 { return "Less than 0.1 mi" }
        return String(format: "%.1f mi", distanceMiles)
    }
}
