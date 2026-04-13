const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

function parseBoolean(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    return String(value).trim().toLowerCase() === "true";
}

function parseInteger(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value) {
    return String(value || "")
        .split(",")
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
}

function parseSameSite(value) {
    const normalized = String(value || "lax").trim().toLowerCase();
    if (normalized === "strict" || normalized === "none") {
        return normalized;
    }

    return "lax";
}

function requireEnv(name) {
    const value = String(process.env[name] || "").trim();
    if (!value) {
        throw new Error(name + " is required");
    }

    return value;
}

function loadConfig() {
    return {
        port: parseInteger(process.env.PORT, 3000),
        allowedOrigins: parseList(process.env.ALLOWED_ORIGINS),
        githubAdminAllowlist: new Set(
            parseList(process.env.GITHUB_ADMIN_ALLOWLIST).map(function (item) {
                return item.toLowerCase();
            })
        ),
        telegramBotToken: String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
        telegramChatId: String(process.env.TELEGRAM_CHAT_ID || "").trim(),
        sessionSecret: requireEnv("SESSION_SECRET"),
        contentSourceUrl: String(process.env.CONTENT_SOURCE_URL || "https://snafstudio.ru/data/content.json").trim(),
        sqlitePath: path.resolve(process.env.SQLITE_PATH || path.join(process.cwd(), "data", "snafstudio.sqlite")),
        adminAppUrl: String(process.env.ADMIN_APP_URL || "").trim(),
        adminSessionTtlHours: parseInteger(process.env.ADMIN_SESSION_TTL_HOURS, 24),
        contentRefreshMs: parseInteger(process.env.CONTENT_REFRESH_MS, 300000),
        cookieSecure: parseBoolean(process.env.COOKIE_SECURE, false),
        cookieSameSite: parseSameSite(process.env.COOKIE_SAME_SITE),
        adminCookieName: "snaf_admin_session",
        leadStatuses: ["new", "in_progress", "closed", "spam"],
        patchableLeadStatuses: ["in_progress", "closed", "spam"],
        inboxStatuses: ["all", "new", "in_progress", "closed", "spam"],
        contactTypes: ["telegram", "phone", "email"]
    };
}

module.exports = {
    loadConfig
};
