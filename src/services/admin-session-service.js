const crypto = require("crypto");

function createAdminSessionService(options) {
    const secret = options.secret;
    const ttlHours = options.ttlHours;
    const cookieName = options.cookieName;
    const cookieSecure = options.cookieSecure;
    const cookieSameSite = options.cookieSameSite;

    function createSessionToken(username) {
        const payload = {
            username: username,
            issuedAt: Date.now(),
            expiresAt: Date.now() + (ttlHours * 60 * 60 * 1000)
        };
        const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
        const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
        return encoded + "." + signature;
    }

    function verifySessionToken(token) {
        if (!token || token.indexOf(".") === -1) {
            return null;
        }

        const parts = token.split(".");
        const encoded = parts[0];
        const signature = parts[1];
        const expectedSignature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");

        if (!safeCompare(signature, expectedSignature)) {
            return null;
        }

        try {
            const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
            if (!payload.expiresAt || payload.expiresAt < Date.now()) {
                return null;
            }

            return payload;
        } catch (error) {
            return null;
        }
    }

    function getCookieOptions() {
        return {
            httpOnly: true,
            secure: cookieSecure,
            sameSite: cookieSameSite,
            maxAge: ttlHours * 60 * 60 * 1000,
            path: "/"
        };
    }

    return {
        cookieName: cookieName,
        createSessionToken: createSessionToken,
        verifySessionToken: verifySessionToken,
        getCookieOptions: getCookieOptions
    };
}

function safeCompare(left, right) {
    try {
        return crypto.timingSafeEqual(Buffer.from(String(left)), Buffer.from(String(right)));
    } catch (error) {
        return false;
    }
}

module.exports = {
    createAdminSessionService
};
