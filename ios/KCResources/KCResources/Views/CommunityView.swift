import CoreLocation
import SwiftUI

struct CommunityView: View {
    @EnvironmentObject private var community: CommunityStore
    @EnvironmentObject private var locationManager: LocationManager

    @AppStorage("radiusMiles") private var radiusMiles: Double = 5

    enum Segment: String, CaseIterable, Identifiable {
        case events
        case posts
        var id: String { rawValue }
        var title: String { self == .events ? "Events" : "Posts" }
    }

    @State private var segment: Segment = .events
    @State private var selectedCategories: Set<ResourceCategory> = []

    private var days: [EventDay] {
        community.upcomingByDay(categories: selectedCategories)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("View", selection: $segment) {
                    ForEach(Segment.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

                freshnessBar

                Group {
                    switch segment {
                    case .events: eventsList
                    case .posts: postsList
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Community")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await refresh() }
            .task {
                // Only hit the network if we have nothing or the cache has aged out.
                if !community.hasEverLoaded || community.isStale {
                    await refresh()
                }
            }
        }
    }

    private func refresh() async {
        await community.refresh(near: locationManager.location, radiusMiles: radiusMiles)
    }

    // MARK: - Freshness

    /// The feed makes claims about specific afternoons, so how old it is has to be
    /// visible rather than implied.
    @ViewBuilder
    private var freshnessBar: some View {
        if community.isLoading {
            banner(icon: "arrow.clockwise", text: "Refreshing…", tint: .secondary)
        } else if let error = community.loadError {
            banner(icon: "wifi.slash", text: error, tint: .orange)
        } else if community.isShowingBundledData {
            // Bundled schedules are accurate as published but were fixed when the
            // app shipped, so say that plainly rather than claiming freshness.
            banner(
                icon: "doc.text",
                text: "Schedules published in the Street Sheet. Call ahead — times can change.",
                tint: .secondary
            )
        } else if community.isStale && community.hasEverLoaded {
            banner(
                icon: "clock.badge.exclamationmark",
                text: "\(community.freshnessText). Pull down to refresh — times may have changed.",
                tint: .orange
            )
        } else if community.hasEverLoaded {
            banner(icon: "checkmark.circle", text: community.freshnessText, tint: .secondary)
        }
    }

    private func banner(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
            Text(text)
            Spacer(minLength: 0)
        }
        .font(.caption)
        .foregroundStyle(tint)
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint == .orange ? Color.orange.opacity(0.10) : Color.clear)
    }

    // MARK: - Events

    private var eventsList: some View {
        List {
            Section {
                CategoryChipRow(selected: $selectedCategories)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            if days.isEmpty {
                emptyState(
                    icon: "calendar",
                    title: community.hasEverLoaded ? "Nothing scheduled" : "No events loaded",
                    message: community.hasEverLoaded
                        ? "No upcoming events match your filters. Regular hours are on the Map tab."
                        : "Pull down to load events from the server."
                )
            }

            ForEach(days) { day in
                Section {
                    ForEach(day.events) { event in
                        EventRow(event: event, userLocation: locationManager.location)
                    }
                } header: {
                    Text(day.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .textCase(nil)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Posts

    private var postsList: some View {
        List {
            if community.sortedPosts.isEmpty {
                emptyState(
                    icon: "megaphone",
                    title: community.hasEverLoaded ? "No posts yet" : "No posts loaded",
                    message: community.hasEverLoaded
                        ? "Updates from local organisations will appear here."
                        : "Pull down to load posts from the server."
                )
            }
            ForEach(community.sortedPosts) { post in
                PostRow(post: post)
            }
        }
        .listStyle(.insetGrouped)
    }

    private func emptyState(icon: String, title: String, message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 30))
                .foregroundStyle(.secondary)
            Text(title).font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }
}

// MARK: - Category chips

struct CategoryChipRow: View {
    @Binding var selected: Set<ResourceCategory>

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(title: "All", symbol: "square.grid.2x2.fill", tint: .accentColor,
                     isOn: selected.isEmpty) { selected.removeAll() }

                ForEach(ResourceCategory.allCases) { category in
                    chip(title: category.title, symbol: category.symbol, tint: category.tint,
                         isOn: selected.contains(category)) {
                        if selected.contains(category) { selected.remove(category) }
                        else { selected.insert(category) }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollClipDisabled()
    }

    private func chip(title: String, symbol: String, tint: Color, isOn: Bool,
                      action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.snappy(duration: 0.2)) { action() }
        } label: {
            Label(title, systemImage: symbol)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(isOn ? tint : Color(.secondarySystemGroupedBackground), in: Capsule())
                .foregroundStyle(isOn ? .white : .primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Event row

struct EventRow: View {
    let event: CommunityEvent
    let userLocation: CLLocation?

    private var distanceText: String? {
        guard let userLocation, let eventLocation = event.location else { return nil }
        let miles = userLocation.distance(from: eventLocation) / 1609.344
        return miles < 0.1 ? "Less than 0.1 mi" : String(format: "%.1f mi", miles)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: event.category.symbol)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(
                        event.isCancelled ? Color.secondary : event.category.tint,
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text(event.title)
                        .font(.headline)
                        .strikethrough(event.isCancelled)
                        .foregroundStyle(event.isCancelled ? .secondary : .primary)
                    Text(event.organization)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 4)

                if let distanceText {
                    Text(distanceText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }

            HStack(spacing: 6) {
                if event.isCancelled {
                    tag("Cancelled", color: .red)
                } else if event.isHappeningNow {
                    tag("Happening now", color: .green)
                }
                Label(event.timeRangeText, systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Label(event.displayLocation, systemImage: "mappin.and.ellipse")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if event.isCancelled && !event.cancellationNote.isEmpty {
                Text(event.cancellationNote)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            } else if !event.description.isEmpty {
                Text(event.description)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if !event.isCancelled {
                HStack(spacing: 8) {
                    if event.mappable {
                        Button {
                            DirectionsService.open(event.asResourceForDirections, using: .apple)
                        } label: {
                            Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                                .font(.footnote.weight(.semibold))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(event.category.tint)
                    }
                    if event.hasPhone {
                        Button {
                            DirectionsService.call(event.asResourceForDirections)
                        } label: {
                            Label("Call", systemImage: "phone.fill")
                                .font(.footnote.weight(.semibold))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(.top, 2)
            }
        }
        .padding(.vertical, 4)
        .opacity(event.isCancelled ? 0.75 : 1)
    }

    private func tag(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

// MARK: - Post row

struct PostRow: View {
    let post: CommunityPost

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if post.pinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .accessibilityLabel("Pinned")
                }
                Label(post.category.title, systemImage: post.category.symbol)
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(post.category.tint.opacity(0.15), in: Capsule())
                    .foregroundStyle(post.category.tint)

                Spacer(minLength: 0)

                Text(post.createdAt.formatted(.relative(presentation: .named)))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(post.title).font(.headline)
            Text(post.content).font(.subheadline).foregroundStyle(.secondary)

            Text("Posted by \(post.organization)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}
