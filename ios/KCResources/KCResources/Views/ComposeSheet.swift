import SwiftUI

/// Lets a signed-in organisation publish an event or a post. Matches the fields
/// the server validates in `communityController.createEvent` / `createPost`.
struct ComposeSheet: View {
    @EnvironmentObject private var community: CommunityStore
    @EnvironmentObject private var session: OrgSession
    @Environment(\.dismiss) private var dismiss

    /// Which composer opens first. The caller passes the tab the user was on.
    let initialKind: Kind

    enum Kind: String, CaseIterable, Identifiable {
        case event
        case post
        var id: String { rawValue }
        var title: String { self == .event ? "Event" : "Post" }
    }

    @State private var kind: Kind
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    // Event fields
    @State private var eventTitle = ""
    @State private var eventDescription = ""
    @State private var eventCategory: ResourceCategory = .food
    @State private var locationName = ""
    @State private var address = ""
    @State private var city = "Kansas City"
    @State private var stateField = "MO"
    @State private var zip = ""
    @State private var contactPhone = ""
    @State private var startsAt = Self.defaultStart
    @State private var endsAt = Self.defaultStart.addingTimeInterval(2 * 3600)

    // Post fields
    @State private var postTitle = ""
    @State private var postContent = ""
    @State private var postCategory = CommunityPost.Category.update
    @State private var pinned = false

    init(initialKind: Kind) {
        self.initialKind = initialKind
        _kind = State(initialValue: initialKind)
    }

    private static var defaultStart: Date {
        // Next round hour, a sensible default for "an event later today".
        let cal = Calendar.current
        let next = cal.date(bySetting: .minute, value: 0, of: Date().addingTimeInterval(3600)) ?? Date()
        return next
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Type", selection: $kind) {
                        ForEach(Kind.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text(session.organization.map { "Publishing as \($0)." } ?? "")
                }

                switch kind {
                case .event: eventFields
                case .post: postFields
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.callout)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("New \(kind.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Publish") { Task { await submit() } }
                        .disabled(isSubmitting || !canSubmit)
                }
            }
            .overlay {
                if isSubmitting {
                    ProgressView().controlSize(.large)
                }
            }
        }
    }

    // MARK: - Event form

    private var eventFields: some View {
        Group {
            Section("Event") {
                TextField("Title", text: $eventTitle)
                Picker("Category", selection: $eventCategory) {
                    ForEach(ResourceCategory.allCases) { Text($0.title).tag($0) }
                }
                TextField("Description", text: $eventDescription, axis: .vertical)
                    .lineLimit(2...5)
            }

            Section("When") {
                DatePicker("Starts", selection: $startsAt)
                DatePicker("Ends", selection: $endsAt, in: startsAt...)
            }

            Section {
                TextField("Location name (e.g. Cherith Brook)", text: $locationName)
                TextField("Street address", text: $address)
                TextField("City", text: $city)
                TextField("State", text: $stateField)
                    .textInputAutocapitalization(.characters)
                TextField("ZIP", text: $zip)
                    .keyboardType(.numberPad)
                TextField("Contact phone", text: $contactPhone)
                    .keyboardType(.phonePad)
            } header: {
                Text("Where")
            } footer: {
                Text("An address lets the event show a distance and a map pin. Leave it blank for a described-only location like a camp.")
            }
        }
    }

    // MARK: - Post form

    private var postFields: some View {
        Group {
            Section("Post") {
                TextField("Title", text: $postTitle)
                Picker("Category", selection: $postCategory) {
                    ForEach(CommunityPost.Category.allCases, id: \.self) { category in
                        Text(category.title).tag(category)
                    }
                }
                TextField("What do people need to know?", text: $postContent, axis: .vertical)
                    .lineLimit(3...8)
            }

            Section {
                Toggle("Pin to top", isOn: $pinned)
            } footer: {
                Text("Pinned posts stay at the top of the feed. Use it for urgent, time-sensitive notices. Posts expire after a week unless renewed.")
            }
        }
    }

    // MARK: - Submit

    private var canSubmit: Bool {
        switch kind {
        case .event: return !eventTitle.trimmed.isEmpty
        case .post: return !postTitle.trimmed.isEmpty && !postContent.trimmed.isEmpty
        }
    }

    private func submit() async {
        guard let token = session.token else {
            errorMessage = "Your session expired. Sign in again."
            return
        }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            switch kind {
            case .event:
                try await community.createEvent(eventBody(), token: token)
            case .post:
                try await community.createPost(postBody(), token: token)
            }
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// ISO8601 with the device's offset, so the server stores the right instant.
    private func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    private func eventBody() -> [String: Any] {
        var body: [String: Any] = [
            "title": eventTitle.trimmed,
            "description": eventDescription.trimmed,
            "category": eventCategory.rawValue,
            "locationName": locationName.trimmed,
            "address": address.trimmed,
            "city": city.trimmed,
            "state": stateField.trimmed,
            "zipCode": zip.trimmed,
            "contactPhone": contactPhone.trimmed,
            "startsAt": iso(startsAt),
            "endsAt": iso(endsAt),
        ]
        // Drop empties so the server sees clean input.
        body = body.filter { !(($0.value as? String)?.isEmpty ?? false) }
        return body
    }

    private func postBody() -> [String: Any] {
        [
            "title": postTitle.trimmed,
            "content": postContent.trimmed,
            "category": postCategory.rawValue,
            "pinned": pinned,
        ]
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
