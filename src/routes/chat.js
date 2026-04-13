const express = require("express");

const {
    requireObject,
    requiredString,
    optionalString,
    requiredEnum,
    requiredSessionId,
    optionalSessionId,
    requireTrue
} = require("../utils/validation");
const { asyncHandler } = require("../utils/http");

function createChatRouter(options) {
    const router = express.Router();
    const store = options.store;
    const leadService = options.leadService;
    const chatResponder = options.chatResponder;
    const contactTypes = options.contactTypes;

    router.post("/session", function (req, res) {
        const body = requireObject(req.body, "body");
        const session = store.createChatSession({
            sourcePage: optionalString("sourcePage", body.sourcePage, 1024),
            referrer: optionalString("referrer", body.referrer, 2048),
            userAgent: optionalString("userAgent", body.userAgent || req.get("user-agent"), 2048)
        });

        res.json({
            sessionId: session.id
        });
    });

    router.post("/message", asyncHandler(async function (req, res) {
        const body = requireObject(req.body, "body");
        const message = requiredString("message", body.message, 4000);
        const sourcePage = optionalString("sourcePage", body.sourcePage, 1024);
        const referrer = optionalString("referrer", body.referrer, 2048);
        const userAgent = optionalString("userAgent", req.get("user-agent"), 2048);
        let sessionId = optionalSessionId(body.sessionId);

        if (!sessionId) {
            sessionId = store.createChatSession({
                sourcePage: sourcePage,
                referrer: referrer,
                userAgent: userAgent
            }).id;
        }

        const replyPayload = chatResponder.generateReply(message);

        await leadService.recordChatMessage({
            sessionId: sessionId,
            userMessage: message,
            botReply: replyPayload.reply,
            matchType: replyPayload.matchType,
            sourcePage: sourcePage,
            referrer: referrer,
            userAgent: userAgent
        });

        res.json({
            sessionId: sessionId,
            reply: replyPayload.reply,
            matchType: replyPayload.matchType,
            nextStep: replyPayload.nextStep,
            showLeadCta: replyPayload.showLeadCta
        });
    }));

    router.post("/lead", asyncHandler(async function (req, res) {
        const body = requireObject(req.body, "body");
        const sessionId = requiredSessionId(body.sessionId);
        const name = optionalString("name", body.name, 160);
        const contactType = requiredEnum("contactType", body.contactType, contactTypes);
        const contactValue = requiredString("contactValue", body.contactValue, 320);
        const question = optionalString("question", body.question, 4000);
        const sourcePage = optionalString("sourcePage", body.sourcePage, 1024);
        const referrer = optionalString("referrer", body.referrer, 2048);
        const userAgent = optionalString("userAgent", req.get("user-agent"), 2048);

        requireTrue("consent", body.consent);

        const lead = await leadService.captureLead({
            sessionId: sessionId,
            name: name,
            contactType: contactType,
            contactValue: contactValue,
            question: question,
            consent: true,
            sourcePage: sourcePage,
            referrer: referrer,
            userAgent: userAgent
        });

        res.json({
            leadId: lead.id,
            message: "\u0421\u043f\u0430\u0441\u0438\u0431\u043e! \u0417\u0430\u044f\u0432\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430."
        });
    }));

    return router;
}

module.exports = {
    createChatRouter
};
