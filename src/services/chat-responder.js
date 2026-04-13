const {
    PRICE_PATTERNS,
    TIMELINE_PATTERNS,
    SERVICE_PATTERNS,
    CONTACT_PATTERNS,
    HANDOFF_PATTERNS,
    findBestFaqMatch,
    tokenize,
    normalize,
    hasAny
} = require("./matcher-index");

function createChatResponder(options) {
    const contentService = options.contentService;

    function generateReply(message) {
        const matcherData = contentService.getMatcherData();
        const normalizedMessage = normalize(message);
        const tokens = tokenize(message);

        if (hasAny(normalizedMessage, PRICE_PATTERNS)) {
            return createReply(matcherData.replies.pricing, "pricing", "offer_lead");
        }

        if (hasAny(normalizedMessage, TIMELINE_PATTERNS)) {
            return createReply(matcherData.replies.timeline, "faq", "offer_lead");
        }

        if (hasAny(normalizedMessage, SERVICE_PATTERNS)) {
            return createReply(matcherData.replies.services, "faq", "offer_lead");
        }

        if (hasAny(normalizedMessage, CONTACT_PATTERNS)) {
            return createReply(matcherData.replies.contact, "faq", "offer_lead");
        }

        const faqMatch = findBestFaqMatch(tokens, matcherData);
        if (faqMatch && faqMatch.score >= 2) {
            return createReply(faqMatch.answer, "faq", "offer_lead");
        }

        if (hasAny(normalizedMessage, HANDOFF_PATTERNS) || tokens.length >= 5) {
            return createReply(matcherData.replies.handoff, "handoff", "capture_lead");
        }

        return createReply(matcherData.replies.fallback, "fallback", "capture_lead");
    }

    return {
        generateReply: generateReply
    };
}

function createReply(reply, matchType, nextStep) {
    return {
        reply: reply,
        matchType: matchType,
        nextStep: nextStep,
        showLeadCta: true
    };
}

module.exports = {
    createChatResponder
};
