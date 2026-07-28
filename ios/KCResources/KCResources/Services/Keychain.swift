import Foundation
import Security

/// Minimal Keychain wrapper for the one secret this app holds: the org session
/// token.
///
/// The token goes in the Keychain rather than UserDefaults because it grants
/// publishing rights — UserDefaults is an unencrypted plist, readable from a
/// backup or a jailbroken device. `kSecAttrAccessibleAfterFirstUnlock` keeps it
/// available for background refreshes while still protecting it at rest.
enum Keychain {

    private static let service = "org.kcresources.session"
    private static let account = "org_session_token"

    @discardableResult
    static func saveToken(_ token: String) -> Bool {
        guard let data = token.data(using: .utf8) else { return false }

        // Delete any existing item first — SecItemAdd fails on a duplicate.
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
    }

    static func readToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }
        return token
    }

    @discardableResult
    static func deleteToken() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
