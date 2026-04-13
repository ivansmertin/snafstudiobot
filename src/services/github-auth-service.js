const crypto = require("crypto");
const { HttpError } = require("../utils/errors");

function createGithubAuthService(options) {
    const allowlist = options.allowlist;
    const cacheTtlMs = Number(options.cacheTtlMs || 10 * 60 * 1000);
    const tokenCache = new Map();

    async function authorize(token) {
        if (!allowlist.size) {
            throw new HttpError(500, "GITHUB_ADMIN_ALLOWLIST is not configured");
        }

        const cacheKey = hashToken(token);
        const cachedEntry = tokenCache.get(cacheKey);
        if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
            if (!cachedEntry.allowed) {
                throw new HttpError(403, "GitHub user is not allowed");
            }

            return cachedEntry.username;
        }

        if (cachedEntry) {
            tokenCache.delete(cacheKey);
        }

        let response;
        try {
            response = await fetch("https://api.github.com/user", {
                headers: {
                    Authorization: "Bearer " + token,
                    Accept: "application/vnd.github+json",
                    "User-Agent": "snafstudio-backend",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                signal: AbortSignal.timeout(10000)
            });
        } catch (error) {
            throw new HttpError(502, "GitHub API request failed");
        }

        if (!response.ok) {
            throw new HttpError(401, "GitHub token is invalid");
        }

        const user = await response.json();
        const username = String(user && user.login || "").trim();
        const allowed = Boolean(username) && allowlist.has(username.toLowerCase());

        tokenCache.set(cacheKey, {
            username: username,
            allowed: allowed,
            expiresAt: Date.now() + cacheTtlMs
        });

        if (!allowed) {
            throw new HttpError(403, "GitHub user is not allowed");
        }

        return username;
    }

    return {
        authorize: authorize
    };
}

function hashToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

module.exports = {
    createGithubAuthService
};
