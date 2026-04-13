const { loadConfig } = require("./config");
const { createApp } = require("./app");
const { createStore } = require("./db");
const { createContentService } = require("./services/content-service");
const { createChatResponder } = require("./services/chat-responder");
const { createTelegramService } = require("./services/telegram-service");
const { createLeadService } = require("./services/lead-service");
const { createAdminSessionService } = require("./services/admin-session-service");
const { createGithubAuthService } = require("./services/github-auth-service");
const { createRequireAdminAuth } = require("./middleware/require-admin-auth");

async function main() {
    const config = loadConfig();
    const store = createStore({ sqlitePath: config.sqlitePath });
    const contentService = createContentService({
        sourceUrl: config.contentSourceUrl,
        refreshMs: config.contentRefreshMs
    });
    const chatResponder = createChatResponder({
        contentService: contentService
    });
    const telegramService = createTelegramService({
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
        adminAppUrl: config.adminAppUrl
    });
    const leadService = createLeadService({
        store: store,
        telegramService: telegramService
    });
    const adminSessionService = createAdminSessionService({
        secret: config.sessionSecret,
        ttlHours: config.adminSessionTtlHours,
        cookieName: config.adminCookieName,
        cookieSecure: config.cookieSecure,
        cookieSameSite: config.cookieSameSite
    });
    const githubAuthService = createGithubAuthService({
        allowlist: config.githubAdminAllowlist,
        cacheTtlMs: 10 * 60 * 1000
    });
    const requireAdminAuth = createRequireAdminAuth({
        adminSessionService: adminSessionService
    });

    const app = createApp({
        config: config,
        store: store,
        contentService: contentService,
        leadService: leadService,
        chatResponder: chatResponder,
        adminSessionService: adminSessionService,
        githubAuthService: githubAuthService,
        requireAdminAuth: requireAdminAuth
    });

    await contentService.start();

    const server = app.listen(config.port, function () {
        console.log("[snafstudio-backend] listening on port " + config.port);
    });

    let shuttingDown = false;
    function shutdown() {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        console.log("[snafstudio-backend] shutting down");
        contentService.stop();

        server.close(function () {
            store.close();
            process.exit(0);
        });

        const forceExitTimer = setTimeout(function () {
            process.exit(1);
        }, 5000);

        if (typeof forceExitTimer.unref === "function") {
            forceExitTimer.unref();
        }
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

if (require.main === module) {
    main().catch(function (error) {
        console.error("[snafstudio-backend] failed to start", error);
        process.exit(1);
    });
}

module.exports = {
    main
};
