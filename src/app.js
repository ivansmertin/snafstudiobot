const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const { createChatRouter } = require("./routes/chat");
const { createAdminRouter } = require("./routes/admin");
const { createHealthRouter } = require("./routes/health");
const { notFound, errorHandler } = require("./utils/http");
const { HttpError } = require("./utils/errors");

function createApp(options) {
    const app = express();
    const config = options.config;

    const corsOptions = {
        origin: function (origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }

            if (config.allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new HttpError(403, "Origin is not allowed"));
        },
        credentials: true
    };

    app.set("trust proxy", 1);
    app.use(cors(corsOptions));
    app.options("*", cors(corsOptions));
    app.use(express.json({ limit: "256kb" }));
    app.use(cookieParser());

    app.use("/api", createHealthRouter({
        contentService: options.contentService
    }));

    app.use("/api/chat", createChatRouter({
        store: options.store,
        leadService: options.leadService,
        chatResponder: options.chatResponder,
        contactTypes: config.contactTypes
    }));

    app.use("/api/admin", createAdminRouter({
        githubAuthService: options.githubAuthService,
        adminSessionService: options.adminSessionService,
        requireAdminAuth: options.requireAdminAuth,
        store: options.store,
        inboxStatuses: config.inboxStatuses,
        patchableLeadStatuses: config.patchableLeadStatuses
    }));

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = {
    createApp
};
