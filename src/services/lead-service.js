function createLeadService(options) {
    const store = options.store;
    const telegramService = options.telegramService;

    async function recordChatMessage(input) {
        return store.recordChatExchange({
            sessionId: input.sessionId,
            userMessage: input.userMessage,
            botReply: input.botReply,
            matchType: input.matchType,
            sourcePage: input.sourcePage,
            referrer: input.referrer,
            userAgent: input.userAgent,
            now: input.now || new Date().toISOString()
        });
    }

    async function captureLead(input) {
        let lead = store.captureLead({
            sessionId: input.sessionId,
            name: input.name,
            contactType: input.contactType,
            contactValue: input.contactValue,
            question: input.question,
            consent: input.consent,
            sourcePage: input.sourcePage,
            referrer: input.referrer,
            userAgent: input.userAgent,
            matchType: input.matchType,
            now: input.now || new Date().toISOString()
        });

        if (lead && lead.contactValue && !lead.telegramNotifiedAt && telegramService.isEnabled()) {
            try {
                await telegramService.notifyLeadCaptured(lead);
                lead = store.markLeadTelegramNotified(lead.id, new Date().toISOString()) || lead;
            } catch (error) {
                console.error("[telegram]", error.message);
            }
        }

        return lead;
    }

    return {
        recordChatMessage: recordChatMessage,
        captureLead: captureLead
    };
}

module.exports = {
    createLeadService
};
