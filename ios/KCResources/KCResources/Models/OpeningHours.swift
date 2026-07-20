import Foundation

/// Best-effort parser for the free-text `hours` strings in the dataset.
///
/// The data comes from human-written web pages, so this deliberately fails soft:
/// anything it cannot understand yields `.unknown`, and the UI falls back to
/// showing the raw text with a "check hours" note. It is never used to tell
/// someone a place is closed when we aren't sure.
enum OpenState: Equatable {
    case open(closingSoon: Bool)
    case closed
    case alwaysOpen
    case unknown
}

struct OpeningHours {
    /// weekday is 1 = Sunday ... 7 = Saturday, matching Calendar.
    struct Interval {
        let weekday: Int
        let startMinutes: Int
        let endMinutes: Int
    }

    let intervals: [Interval]
    let isAlwaysOpen: Bool

    /// True when the hours depend on *which* week of the month it is —
    /// "2nd & 4th Tue", "closed 4th Wednesday", "every other Thursday".
    ///
    /// We deliberately refuse to compute open/closed for these. A weekday-only
    /// parser reads "2nd & 4th Tue 8:30-10:30am" as *every* Tuesday, which would
    /// send someone to a clinic on a 1st Tuesday when it's shut. Since a wasted
    /// trip here can mean miles on foot, we show "Check hours" instead of
    /// guessing in either direction.
    let isConditional: Bool

    private static let conditionalMarkers = [
        "1st", "2nd", "3rd", "4th",
        "first ", "second ", "third ", "fourth ",
        "every other", "bi-weekly", "biweekly",
        "of each month", "of the month", "monthly",
    ]

    private static let dayTokens: [(String, Int)] = [
        ("sunday", 1), ("sun", 1),
        ("monday", 2), ("mon", 2),
        ("tuesday", 3), ("tues", 3), ("tue", 3),
        ("wednesday", 4), ("weds", 4), ("wed", 4),
        ("thursday", 5), ("thurs", 5), ("thu", 5),
        ("friday", 6), ("fri", 6),
        ("saturday", 7), ("sat", 7),
    ]

    static func parse(_ raw: String) -> OpeningHours {
        let text = raw.lowercased()

        if text.contains("24/7") || text.contains("24 hours") || text.contains("always open") {
            return OpeningHours(intervals: [], isAlwaysOpen: true, isConditional: false)
        }

        let conditional = conditionalMarkers.contains { text.contains($0) }

        var all: [Interval] = []
        for segment in text.split(whereSeparator: { $0 == ";" || $0 == "\n" }) {
            all.append(contentsOf: parseSegment(String(segment)))
        }
        return OpeningHours(intervals: all, isAlwaysOpen: false, isConditional: conditional)
    }

    private static func parseSegment(_ segment: String) -> [Interval] {
        // A segment like "mon-thu 3:00pm-5:00pm" or "tue, wed, fri & sat 11:00am-4:00pm".
        guard let (start, end) = timeRange(in: segment) else { return [] }
        let days = weekdays(in: segment)
        guard !days.isEmpty else { return [] }
        return days.map { Interval(weekday: $0, startMinutes: start, endMinutes: end) }
    }

    private static func weekdays(in segment: String) -> [Int] {
        // Ranges first: "mon-fri", "mon - fri".
        let rangePattern = #"(sun|mon|tue|tues|wed|weds|thu|thurs|fri|sat)[a-z]*\s*[-–]\s*(sun|mon|tue|tues|wed|weds|thu|thurs|fri|sat)[a-z]*"#
        if let m = firstMatch(rangePattern, in: segment),
           let from = dayValue(m[1]), let to = dayValue(m[2]) {
            var days: [Int] = []
            var d = from
            while true {
                days.append(d)
                if d == to { break }
                d = d % 7 + 1
                if days.count > 7 { break }
            }
            return days
        }

        // Otherwise collect every individual day mentioned.
        var found: Set<Int> = []
        for (token, value) in dayTokens where segment.contains(token) {
            found.insert(value)
        }
        if found.isEmpty && (segment.contains("daily") || segment.contains("every day")) {
            return Array(1...7)
        }
        return found.sorted()
    }

    private static func dayValue(_ token: String) -> Int? {
        dayTokens.first { token.hasPrefix($0.0) }?.1
    }

    private static func timeRange(in segment: String) -> (Int, Int)? {
        let pattern = #"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–to]{1,2}\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)"#
        guard let m = firstMatch(pattern, in: segment) else { return nil }

        let endMeridiem = m[6]
        // "8:00-5:00pm" — infer the start meridiem when it's missing.
        let startMeridiem = m[3].isEmpty ? inferredStartMeridiem(hour: Int(m[1]) ?? 0, endMeridiem: endMeridiem) : m[3]

        guard let start = minutes(hour: m[1], minute: m[2], meridiem: startMeridiem),
              let end = minutes(hour: m[4], minute: m[5], meridiem: endMeridiem) else { return nil }
        return (start, end)
    }

    private static func inferredStartMeridiem(hour: Int, endMeridiem: String) -> String {
        // Business hours heuristic: 8-5pm starts in the morning, 4-6pm does not.
        if endMeridiem == "pm" && hour >= 7 && hour <= 11 { return "am" }
        return endMeridiem
    }

    private static func minutes(hour: String, minute: String, meridiem: String) -> Int? {
        guard var h = Int(hour) else { return nil }
        let m = Int(minute) ?? 0
        if meridiem == "pm" && h != 12 { h += 12 }
        if meridiem == "am" && h == 12 { h = 0 }
        guard (0...24).contains(h), (0...59).contains(m) else { return nil }
        return h * 60 + m
    }

    private static func firstMatch(_ pattern: String, in text: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
        else { return nil }
        return (0..<match.numberOfRanges).map { i in
            guard let r = Range(match.range(at: i), in: text) else { return "" }
            return String(text[r])
        }
    }

    // MARK: - Evaluation

    func state(at date: Date = Date(), calendar: Calendar = .current) -> OpenState {
        if isAlwaysOpen { return .alwaysOpen }
        // Week-of-month rules are beyond this parser; say so rather than guess.
        if isConditional { return .unknown }
        guard !intervals.isEmpty else { return .unknown }

        let comps = calendar.dateComponents([.weekday, .hour, .minute], from: date)
        guard let weekday = comps.weekday, let hour = comps.hour, let minute = comps.minute else {
            return .unknown
        }
        let now = hour * 60 + minute

        for interval in intervals where interval.weekday == weekday {
            if now >= interval.startMinutes && now < interval.endMinutes {
                return .open(closingSoon: interval.endMinutes - now <= 60)
            }
        }
        return .closed
    }
}
