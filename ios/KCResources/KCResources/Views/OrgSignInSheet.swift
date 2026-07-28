import SwiftUI

/// Two-step passwordless sign-in, matching the web `OrgAuth`: email, then the
/// 6-digit code emailed back. Publishing is limited to allowlisted orgs, so
/// there's no registration path — just sign-in.
struct OrgSignInSheet: View {
    @EnvironmentObject private var session: OrgSession
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var code = ""
    @State private var rememberDevice = false

    var body: some View {
        NavigationStack {
            Form {
                switch session.state {
                case .awaitingCode(let sentTo):
                    codeStep(sentTo: sentTo)
                default:
                    emailStep
                }
            }
            .navigationTitle("Post as an organization")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onChange(of: session.isSignedIn) { _, signedIn in
                if signedIn { dismiss() }
            }
            .onAppear {
                if email.isEmpty { email = session.rememberedEmail }
            }
        }
    }

    // MARK: - Step 1

    private var emailStep: some View {
        Group {
            Section {
                TextField("you@yourorg.org", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("Organization email")
            } footer: {
                Text("Posting is limited to organizations verified by Care Beyond. Enter your organization email and we'll send a sign-in code.")
            }

            if let error = session.errorMessage {
                Section { errorRow(error) }
            }

            Section {
                Button {
                    Task { await session.requestCode(email: email) }
                } label: {
                    HStack {
                        Text("Send code")
                        if session.isWorking { Spacer(); ProgressView() }
                    }
                }
                .disabled(session.isWorking || email.isEmpty)
            }
        }
    }

    // MARK: - Step 2

    private func codeStep(sentTo: String) -> some View {
        Group {
            Section {
                TextField("000000", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.system(.title2, design: .monospaced))
                    .onChange(of: code) { _, newValue in
                        // Digits only, capped at 6 — mirrors the web input.
                        code = String(newValue.filter(\.isNumber).prefix(6))
                    }
            } header: {
                Text("6-digit code sent to \(sentTo)")
            } footer: {
                if let notice = session.notice {
                    Text(notice)
                }
            }

            Section {
                Toggle("Remember this device for 30 days", isOn: $rememberDevice)
                Text("Leave off on shared or public devices.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let error = session.errorMessage {
                Section { errorRow(error) }
            }

            Section {
                Button {
                    Task { await session.verify(code: code, rememberDevice: rememberDevice) }
                } label: {
                    HStack {
                        Text("Sign in")
                        if session.isWorking { Spacer(); ProgressView() }
                    }
                }
                .disabled(session.isWorking || code.count != 6)

                Button("Use a different email") {
                    code = ""
                    session.backToEmail()
                }
                .foregroundStyle(.secondary)
            }
        }
    }

    private func errorRow(_ message: String) -> some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.callout)
            .foregroundStyle(.red)
    }
}
