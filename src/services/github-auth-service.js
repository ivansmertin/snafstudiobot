const { HttpError } = require("../utils/errors");

function createGithubAuthService(options) {
    const allowlist = options.allowlist;

    async function authorize(token) {
        if (!allowlist.size) {
            throw new HttpError(500, "GITHUB_ADMIN_ALLOWLIST is not configured");
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
        if (!username || !allowlist.has(username.toLowerCase())) {
            throw new HttpError(403, "GitHub user is not allowed");
        }

        return username;
    }

    return {
        authorize: authorize
    };
}

module.exports = {
    createGithubAuthService
};
