import CoreLocation
import Foundation
import SwiftUI

// MARK: - Event

struct CommunityEvent: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let description: String
    let organization: String
    let category: ResourceCategory
    let locationName: String
    let address: String
    let city: String
    let state: String
    let zipCode: String
    let startsAt: Date
    let endsAt: Date?
    let status: Status
    let cancellationNote: String
    let contactPhone: String
    let resourceId: String?
    let mappable: Bool

    var latitude: Double?
    var longitude: Double?

    enum Status: String, Codable {
        case scheduled
        case cancelled

        /// Unknown values decode as `scheduled` rather than failing the whole payload —
        /// one odd row from the server shouldn't blank the entire events list.
        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Status(rawValue: raw) ?? .scheduled
        }
    }

    var isCancelled: Bool { status == .cancelled }

    var coordinate: CLLocationCoordinate2D? {
        guard let latitude, let longitude else { return nil }
        return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var location: CLLocation? {
        guard let latitude, let longitude else { return nil }
        return CLLocation(latitude: latitude, longitude: longitude)
    }

    var fullAddress: String {
        [address, city, state, zipCode].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    /// What to show as the place: a named venue if we have one, else the street address.
    var displayLocation: String {
        if !locationName.isEmpty { return locationName }
        if !address.isEmpty { return address }
        return "Location to be confirmed"
    }

    var hasPhone: Bool { !contactPhone.isEmpty }

    var dialableNumber: String? {
        let digits = contactPhone.filter(\.isNumber)
        return digits.isEmpty ? nil : digits
    }

    var isOver: Bool {
        (endsAt ?? startsAt.addingTimeInterval(3600)) < Date()
    }

    var isHappeningNow: Bool {
        guard !isCancelled else { return false }
        let end = endsAt ?? startsAt.addingTimeInterval(3600)
        return startsAt <= Date() && Date() < end
    }

    var timeRangeText: String {
        let start = startsAt.formatted(date: .omitted, time: .shortened)
        guard let endsAt else { return start }
        return "\(start) – \(endsAt.formatted(date: .omitted, time: .shortened))"
    }

    /// Converts to a Resource so we can reuse the existing directions handoff
    /// rather than duplicating the Apple/Google Maps logic.
    var asResourceForDirections: Resource {
        Resource(
            id: id, name: title, organization: organization, category: category,
            services: [], description: description, address: address, city: city,
            state: state, zipCode: zipCode, phone: contactPhone, website: "",
            hours: "", eligibility: "", verified: true, source: organization,
            mappable: mappable, latitude: latitude, longitude: longitude
        )
    }
}

// MARK: - Post

struct CommunityPost: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let content: String
    let organization: String
    let category: Category
    let pinned: Bool
    let createdAt: Date
    let expiresAt: Date?
    let resourceId: String?

    enum Category: String, Codable, CaseIterable {
        case update
        case alert
        case closure
        case need

        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Category(rawValue: raw) ?? .update
        }

        var title: String {
            switch self {
            case .update: return "Update"
            case .alert: return "Alert"
            case .closure: return "Closure"
            case .need: return "Need"
            }
        }

        var symbol: String {
            switch self {
            case .update: return "megaphone.fill"
            case .alert: return "exclamationmark.triangle.fill"
            case .closure: return "xmark.circle.fill"
            case .need: return "hand.raised.fill"
            }
        }

        var tint: Color {
            switch self {
            case .update: return Color(red: 0.20, green: 0.45, blue: 0.78)
            case .alert: return Color(red: 0.85, green: 0.45, blue: 0.10)
            case .closure: return Color(red: 0.78, green: 0.22, blue: 0.28)
            case .need: return Color(red: 0.45, green: 0.35, blue: 0.70)
            }
        }
    }
}

// MARK: - Payloads

struct EventsPayload: Codable {
    let version: Int
    let count: Int
    let events: [CommunityEvent]
}

struct PostsPayload: Codable {
    let version: Int
    let count: Int
    let posts: [CommunityPost]
}

// MARK: - Grouping

/// Events bucketed by day, so the list can show "Today" / "Tomorrow" headers
/// instead of a flat wall of dates.
struct EventDay: Identifiable {
    let date: Date
    let events: [CommunityEvent]

    var id: TimeInterval { date.timeIntervalSince1970 }

    var title: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInTomorrow(date) { return "Tomorrow" }
        // Within the coming week, a weekday name is easier to act on than a date.
        if let days = calendar.dateComponents([.day], from: Date(), to: date).day, days < 7 {
            return date.formatted(.dateTime.weekday(.wide))
        }
        return date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }

    static func group(_ events: [CommunityEvent]) -> [EventDay] {
        let calendar = Calendar.current
        let buckets = Dictionary(grouping: events) { calendar.startOfDay(for: $0.startsAt) }
        return buckets.keys.sorted().map { day in
            EventDay(date: day, events: buckets[day]!.sorted { $0.startsAt < $1.startsAt })
        }
    }
}
