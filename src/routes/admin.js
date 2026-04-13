const express = require("express");

const { HttpError } = require("../utils/errors");
const {
    requireObject,
    requiredString,
    stringOrEmpty,
    requiredEnum,
    optionalEnum
} = require("../utils/validation");
const { asyncHandler } = require("../utils/http");

function createAdminRouter(options) {
    const router = express.Router();
    const githubAuthService = options.githubAuthService;
    const adminSessionService = options.adminSessionService;
    const requireAdminAuth = options.requireAdminAuth;
    const store = options.store;
    const inboxStatuses = options.inboxStatuses;
    const patchableLeadStatuses = options.patchableLeadStatuses;

    router.post("/auth/github", asyncHandler(async function (req, res) {
        const body = requireObject(req.body, "body");
        const token = requiredString("token", body.token, 2048);
        const username = await githubAuthService.authorize(token);
        const sessionToken = adminSessionService.createSessionToken(username);

        res.cookie(
            adminSessionService.cookieName,
            sessionToken,
            adminSessionService.getCookieOptions()
        );

        res.json({
            ok: true,
            username: username
        });
    }));

    router.post("/logout", function (req, res) {
        res.clearCookie(
            adminSessionService.cookieName,
            adminSessionService.getCookieOptions()
        );

        res.json({
            ok: true
        });
    });

    router.use(requireAdminAuth);

    router.get("/dashboard", function (req, res) {
        res.json(store.dashboardMetrics());
    });

    router.get("/inbox", function (req, res) {
        const status = optionalEnum("status", req.query.status || "all", inboxStatuses) || "all";
        res.json(store.listLeads(status));
    });

    router.get("/inbox/:id", function (req, res) {
        const leadId = requiredString("id", req.params.id, 128);
        const lead = store.getLeadById(leadId);
        if (!lead) {
            throw new HttpError(404, "Lead not found");
        }

        res.json({
            item: lead
        });
    });

    router.patch("/inbox/:id", function (req, res) {
        const leadId = requiredString("id", req.params.id, 128);
        const body = requireObject(req.body, "body");
        const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
        const hasInternalNote = Object.prototype.hasOwnProperty.call(body, "internalNote");

        if (!hasStatus && !hasInternalNote) {
            throw new HttpError(400, "status or internalNote is required");
        }

        const patch = {};
        if (hasStatus) {
            patch.status = requiredEnum("status", body.status, patchableLeadStatuses);
        }
        if (hasInternalNote) {
            patch.internalNote = stringOrEmpty("internalNote", body.internalNote, 4000);
        }

        const updatedLead = store.updateLeadById(leadId, patch);
        if (!updatedLead) {
            throw new HttpError(404, "Lead not found");
        }

        res.json({
            item: updatedLead
        });
    });

    return router;
}

module.exports = {
    createAdminRouter
};
