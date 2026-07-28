import Foundation
import SwiftUI

/// Passwordless sign-in for verified organisations, mirroring the web client.
///
/// Flow: email → 6-digit code emailed by the server → session token. The token
/// lives in the Keychain (see `Keychain`) and is sent as `Authorization: Bearer`
/// on publish requests. The allowlist on the server is the whole account system;
/// there is nothing to register from the app.
///
/// The email is remembered in UserDefaults (harmless — the inbox code is the
/// real gate), but the token never is.
@MainActor
final class OrgSession: ObservableObject {

    enum State: Equatable {
        case signedOut
        case awaitingCode(email: String)
        case signedIn(organization: String, email: String)
    }

    @Published private(set) var state: State = .signedOut
    @Published var isWorking = false
    @Published var errorMessage: String?
    @Published var notice: String?

    private let emailKey = "orgLoginEmail"

    /// Last email used, to prefill the form.
    var rememberedEmail: String {
        UserDefaults.standard.string(forKey: emailKey) ?? ""
    }

    var isSignedIn: Bool {
        if case .signedIn = state { return true }
        return false
    }

    var organization: String? {
        if case let .signedIn(org, _) = state { return org }
        return nil
    }

    /// The bearer token for authenticated requests, if signed in.
    var token: String? { Keychain.readToken() }

    // MARK: - Session restore

    /// On launch, if we're holding a token, confirm it's still valid. An expired
    /// or revoked token (the org was removed from the allowlist) silently signs
    /// the user out rather than letting them compose a post that will 401.
    func restore() async {
        guard ServerConfig.isConfigured, let token = Keychain.readToken() else { return }
        guard let url = ServerConfig.authURL(path: "me") else { return }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                Keychain.deleteToken()
                state = .signedOut
                return
            }
            let me = try JSONDecoder().decode(MeResponse.self, from: data)
            state = .signedIn(organization: me.organization, email: me.email)
        } catch {
            // Network failure isn't proof the token is bad — keep it and stay
            // signed out until a real request either succeeds or gets a 401.
            state = .signedOut
        }
    }

    // MARK: - Step 1: request a code

    func requestCode(email rawEmail: String) async {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard email.contains("@") else {
            errorMessage = "Enter a valid email address."
            return
        }
        guard let url = ServerConfig.authURL(path: "request-code") else {
            errorMessage = "No server is configured."
            return
        }

        isWorking = true
        errorMessage = nil
        notice = nil
        defer { isWorking = false }

        do {
            let (data, response) = try await postJSON(url, body: ["email": email])
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                errorMessage = decodeError(data) ?? "Couldn't request a code. Try again."
                return
            }
            UserDefaults.standard.set(email, forKey: emailKey)
            notice = (try? JSONDecoder().decode(MessageResponse.self, from: data).message)
                ?? "If that email is registered, a code is on its way."
            state = .awaitingCode(email: email)
        } catch {
            errorMessage = "Couldn't reach the server. Check your connection."
        }
    }

    // MARK: - Step 2: verify the code

    func verify(code rawCode: String, rememberDevice: Bool) async {
        guard case let .awaitingCode(email) = state else { return }
        let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard code.count == 6, code.allSatisfy(\.isNumber) else {
            errorMessage = "Enter the 6-digit code."
            return
        }
        guard let url = ServerConfig.authURL(path: "verify") else { return }

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            let (data, response) = try await postJSON(url, body: [
                "email": email,
                "code": code,
                "rememberDevice": rememberDevice,
            ])
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                errorMessage = decodeError(data) ?? "That code didn't work. Try again."
                return
            }
            let session = try JSONDecoder().decode(VerifyResponse.self, from: data)
            Keychain.saveToken(session.token)
            state = .signedIn(organization: session.organization, email: session.email)
            notice = nil
        } catch {
            errorMessage = "Couldn't reach the server. Check your connection."
        }
    }

    func backToEmail() {
        if case let .awaitingCode(email) = state {
            state = .signedOut
            errorMessage = nil
            notice = nil
            _ = email
        }
    }

    // MARK: - Sign out

    func signOut() async {
        // Best-effort server-side revoke; the local delete is what actually
        // matters for this device.
        if let token = Keychain.readToken(), let url = ServerConfig.authURL(path: "logout") {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }
        Keychain.deleteToken()
        state = .signedOut
        errorMessage = nil
        notice = nil
    }

    // MARK: - Helpers

    private func postJSON(_ url: URL, body: [String: Any]) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = 15
        return try await URLSession.shared.data(for: request)
    }

    private func decodeError(_ data: Data) -> String? {
        (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error
    }

    // MARK: - Response shapes

    private struct MessageResponse: Decodable { let message: String }
    private struct ErrorResponse: Decodable { let error: String }
    private struct MeResponse: Decodable { let organization: String; let email: String }
    private struct VerifyResponse: Decodable {
        let organization: String
        let email: String
        let token: String
    }
}
