import SwiftUI

struct ResourceListView: View {
    let results: [RankedResource]
    @Binding var selectedID: String?
    let hasUserLocation: Bool
    let onOpenDetail: (Resource) -> Void

    var body: some View {
        ScrollViewReader { scroll in
            List {
                if results.isEmpty {
                    emptyState
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                ForEach(results) { ranked in
                    ResourceRow(
                        ranked: ranked,
                        isSelected: selectedID == ranked.id,
                        onDirections: { DirectionsService.open(ranked.resource, using: .apple) },
                        onCall: { DirectionsService.call(ranked.resource) },
                        onDetails: { onOpenDetail(ranked.resource) }
                    )
                    .id(ranked.id)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(
                        selectedID == ranked.id
                            ? ranked.resource.category.tint.opacity(0.10)
                            : Color(.systemBackground)
                    )
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.snappy) {
                            selectedID = selectedID == ranked.id ? nil : ranked.id
                        }
                    }
                }
            }
            .listStyle(.plain)
            .onChange(of: selectedID) { _, newValue in
                guard let newValue else { return }
                withAnimation(.easeInOut) {
                    scroll.scrollTo(newValue, anchor: .center)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "mappin.slash")
                .font(.system(size: 30))
                .foregroundStyle(.secondary)
            Text("No resources in range")
                .font(.headline)
            Text(hasUserLocation
                 ? "Try widening the radius or clearing your filters."
                 : "Turn on location, or widen the radius to see everything in the metro.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

// MARK: - Row

struct ResourceRow: View {
    let ranked: RankedResource
    let isSelected: Bool
    let onDirections: () -> Void
    let onCall: () -> Void
    let onDetails: () -> Void

    private var resource: Resource { ranked.resource }

    private var openState: OpenState {
        OpeningHours.parse(resource.hours).state()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: resource.category.symbol)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(resource.category.tint, in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(resource.name)
                        .font(.headline)
                        .lineLimit(2)
                    if !resource.organization.isEmpty, resource.organization != resource.name {
                        Text(resource.organization)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 4)

                if let distanceText = ranked.distanceText {
                    Text(distanceText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }

            HStack(spacing: 6) {
                OpenBadge(state: openState)
                if !resource.verified {
                    Label("Call first", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }

            if resource.mappable {
                Text(resource.fullAddress)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            } else {
                Text(resource.address)
                    .font(.subheadline.italic())
                    .foregroundStyle(.secondary)
            }

            if !resource.hours.isEmpty {
                Label(resource.hours, systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(isSelected ? 4 : 1)
            }

            if isSelected {
                expandedDetail
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var expandedDetail: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !resource.services.isEmpty {
                ServiceChips(services: resource.services, tint: resource.category.tint)
            }

            if !resource.description.isEmpty {
                Text(resource.description)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 8) {
                if resource.mappable {
                    Button(action: onDirections) {
                        Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                            .font(.footnote.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(resource.category.tint)
                }

                if resource.hasPhone {
                    Button(action: onCall) {
                        Label("Call", systemImage: "phone.fill")
                            .font(.footnote.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }

                Button(action: onDetails) {
                    Label("More", systemImage: "info.circle")
                        .font(.footnote.weight(.semibold))
                        .labelStyle(.iconOnly)
                        .frame(width: 34)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("More details about \(resource.name)")
            }
            .buttonStyle(.bordered)
        }
        .padding(.top, 2)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

// MARK: - Small components

struct OpenBadge: View {
    let state: OpenState

    var body: some View {
        switch state {
        case .alwaysOpen:
            badge("Open 24/7", color: .green)
        case .open(let closingSoon):
            badge(closingSoon ? "Closing soon" : "Open now", color: closingSoon ? .orange : .green)
        case .closed:
            badge("Closed now", color: .secondary)
        case .unknown:
            badge("Check hours", color: .secondary)
        }
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

struct ServiceChips: View {
    let services: [String]
    let tint: Color

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(services, id: \.self) { service in
                    Text(service)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(tint.opacity(0.12), in: Capsule())
                        .foregroundStyle(tint)
                }
            }
        }
        .scrollClipDisabled()
    }
}
