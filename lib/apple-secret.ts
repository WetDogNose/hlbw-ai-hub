import * as jose from "jose";

/**
 * Generates a JWT client secret for Apple Sign-In.
 *
 * Apple does not provide a static client secret like other OAuth providers.
 * Instead, you must generate a short-lived JWT signed with the .p8 private key
 * downloaded from the Apple Developer portal.
 *
 * Required env vars:
 * - APPLE_TEAM_ID: Your Apple Developer Team ID (10-char string from top-right of developer.apple.com)
 * - APPLE_KEY_ID: The Key ID from the key you created for Sign In with Apple
 * - APPLE_CLIENT_ID: The Services ID you registered (e.g., com.wotbox.auth)
 * - APPLE_PRIVATE_KEY: The contents of the .p8 file (including BEGIN/END PRIVATE KEY lines)
 *
 * @see https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
 */
export async function generateAppleClientSecret(): Promise<string> {
    const teamId = process.env.APPLE_TEAM_ID;
    const keyId = process.env.APPLE_KEY_ID;
    const clientId = process.env.APPLE_CLIENT_ID;
    const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;

    if (!teamId || !keyId || !clientId || !privateKeyRaw) {
        console.warn(
            "[Apple Auth] Missing one or more Apple Sign-In env vars " +
            "(APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY). " +
            "Apple Sign-In will be non-functional."
        );
        return "apple_not_configured";
    }

    // The private key from .p8 may have escaped newlines when stored as env var
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

    try {
        const key = await jose.importPKCS8(privateKey, "ES256");

        const jwt = await new jose.SignJWT({})
            .setAudience("https://appleid.apple.com")
            .setIssuer(teamId)
            .setSubject(clientId)
            .setIssuedAt()
            .setExpirationTime("180d") // Apple allows up to 6 months
            .setProtectedHeader({ alg: "ES256", kid: keyId })
            .sign(key);

        return jwt;
    } catch (err) {
        console.error("[Apple Auth] Failed to generate Apple client secret. " +
            "The APPLE_PRIVATE_KEY may be truncated or malformed:", err);
        return "apple_not_configured";
    }
}
