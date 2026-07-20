import SwiftUI

struct ResourceDetailSheet: View {
    let resource: Resource
    let distanceMiles: Double?

    @Environment(\.dismiss) private var dismiss

    private var openState: OpenState {
        OpeningHours.parse(resource.hours).state()
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    actionButtons

                    if !resource.services.isEmpty {
                        section("Services") {
                            ServiceChips(services: resource.services, tint: resource.category.tint)
                        }
                    }

                    if !resource.description.isEmpty {
                        section("About") {
                            Text(resource.description)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }

                    section("Details") {
                        VStack(alignment: .leading, spacing: 12) {
                            if resource.mappable {
                                detailRow("mappin.and.ellipse", "Address", resource.fullAddress)
                            } else {
                                detailRow("phone.badge.waveform", "Location", resource.address)
                            }
                            if !resource.hours.isEmpty {
                                detailRow("clock", "Hours", resource.hours)
                            }
                            if resource.hasPhone {
                                detailRow("phone", "Phone", resource.phone)
                            }
                            if !resource.eligibility.isEmpty {
                                detailRow("person.text.rectangle", "Who it's for", resource.eligibility)
                            }
                        }
                    }

                    if !resource.verified {
                        verificationWarning
                    }

                    footerNote
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: resource.category.symbol)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(resource.category.tint, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(resource.name)
                        .font(.title3.bold())
                    if !resource.organization.isEmpty, resource.organization != resource.name {
                        Text(resource.organization)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            HStack(spacing: 8) {
                OpenBadge(state: openState)
                if let distanceMiles {
                    Text(String(format: "%.1f mi away", distanceMiles))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var actionButtons: some View {
        VStack(spacing: 10) {
            if resource.mappable {
                HStack(spacing: 10) {
                    ForEach(DirectionsService.availableProviders) { provider in
                        Button {
                            DirectionsService.open(resource, using: provider)
                        } label: {
                            Label(provider.title, systemImage: provider.symbol)
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(provider == .apple ? resource.category.tint : Color.secondary)
                    }
                }
            }

            HStack(spacing: 10) {
                if resource.hasPhone {
                    Button {
                        DirectionsService.call(resource)
                    } label: {
                        Label("Call \(resource.phone)", systemImage: "phone.fill")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.bordered)
                }

                if !resource.website.isEmpty {
                    Button {
                        DirectionsService.openWebsite(resource)
                    } label: {
                        Label("Website", systemImage: "safari")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var verificationWarning: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 3) {
                Text("Call before you travel")
                    .font(.subheadline.weight(.semibold))
                Text("We haven't been able to confirm this listing's hours or address directly with the provider.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var footerNote: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !resource.source.isEmpty {
                Text("Source: \(resource.source)")
            }
            Text("Hours and availability change often. Calling ahead saves a trip.")
        }
        .font(.caption2)
        .foregroundStyle(.tertiary)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            content()
        }
    }

    private func detailRow(_ symbol: String, _ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.subheadline)
                    .textSelection(.enabled)
            }
        }
    }
}
