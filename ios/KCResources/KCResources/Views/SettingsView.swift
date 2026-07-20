import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: ResourceStore
    @EnvironmentObject private var community: CommunityStore
    @EnvironmentObject private var locationManager: LocationManager

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Location updates", selection: $locationManager.mode) {
                        ForEach(LocationManager.Mode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text(locationManager.mode.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if locationManager.isDenied {
                        Button("Open Settings to turn on location") {
                            locationManager.openSystemSettings()
                        }
                        .font(.callout)
                    }
                } header: {
                    Text("Location")
                } footer: {
                    Text("Location is only used on your device to sort resources by distance. Nothing is uploaded or shared.")
                }

                Section("Getting there") {
                    Label {
                        Text("Kansas City buses are no longer fare-free as of June 1, 2026. Check ridekc.org/fares for passes before you travel.")
                            .font(.callout)
                    } icon: {
                        Image(systemName: "bus.fill").foregroundStyle(.orange)
                    }
                }

                Section {
                    LabeledContent("Resources", value: "\(store.resources.count)")
                    if store.isGeocoding {
                        LabeledContent("Status", value: "Locating addresses…")
                    }
                    if let lastSync = store.lastSync {
                        LabeledContent("Last synced", value: lastSync.formatted(date: .abbreviated, time: .shortened))
                    } else if ServerConfig.isConfigured {
                        LabeledContent("Last synced", value: "Not yet")
                    }
                    if let syncError = store.syncError {
                        Text(syncError).font(.caption).foregroundStyle(.secondary)
                    }
                    if ServerConfig.isConfigured {
                        Button("Sync now") { Task { await store.syncFromServer() } }
                    }
                } header: {
                    Text("Resource data")
                } footer: {
                    Text("Resources work fully offline. If a server is configured, the app refreshes from it when it can.")
                }

                Section {
                    LabeledContent("Events", value: "\(community.events.count)")
                    LabeledContent("Posts", value: "\(community.posts.count)")
                    LabeledContent("Freshness", value: community.freshnessText)
                    if !ServerConfig.isConfigured {
                        Text("No server is configured, so events and posts can't load. Set baseURLString in ServerConfig.swift.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Community")
                } footer: {
                    Text("Only verified local organisations can publish events and posts. The app is read-only, which keeps a feed used by people in crisis from becoming a channel for scams.")
                }

                Section {
                    Text("Primary source: Kansas City Public Library Street Sheet (Summer 2026), published quarterly at kclibrary.org/outreach. Supplemented by the KCPD Community Resource Guide, findfoodpantry.org and provider websites.")
                        .font(.callout)
                    Link("kclibrary.org/outreach", destination: URL(string: "https://kclibrary.org/outreach")!)
                        .font(.callout)
                } header: {
                    Text("Where this comes from")
                } footer: {
                    Text("Hours change often. Entries marked “Call first” haven't been confirmed directly with the provider — calling ahead saves a wasted trip.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
