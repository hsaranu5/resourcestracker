import SwiftUI

struct FilterBar: View {
    @Binding var selectedCategories: Set<ResourceCategory>
    @Binding var radiusMiles: Double
    let resultCount: Int

    private let radiusOptions: [Double] = [1, 3, 5, 10]

    var body: some View {
        VStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    chip(
                        title: "All",
                        symbol: "square.grid.2x2.fill",
                        tint: .accentColor,
                        isOn: selectedCategories.isEmpty
                    ) {
                        selectedCategories.removeAll()
                    }

                    ForEach(ResourceCategory.allCases) { category in
                        chip(
                            title: category.title,
                            symbol: category.symbol,
                            tint: category.tint,
                            isOn: selectedCategories.contains(category)
                        ) {
                            if selectedCategories.contains(category) {
                                selectedCategories.remove(category)
                            } else {
                                selectedCategories.insert(category)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            HStack(spacing: 10) {
                Text("Within")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Picker("Search radius", selection: $radiusMiles) {
                    ForEach(radiusOptions, id: \.self) { miles in
                        Text("\(Int(miles)) mi").tag(miles)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 220)

                Spacer()

                Text("\(resultCount) found")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 8)
        .background(.bar)
    }

    private func chip(
        title: String,
        symbol: String,
        tint: Color,
        isOn: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: { withAnimation(.snappy(duration: 0.2)) { action() } }) {
            Label(title, systemImage: symbol)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(isOn ? tint : Color(.secondarySystemBackground), in: Capsule())
                .foregroundStyle(isOn ? .white : .primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }
}
