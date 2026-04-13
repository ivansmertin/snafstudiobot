const { buildMatcherData } = require("./matcher-index");

function createContentService(options) {
    const sourceUrl = options.sourceUrl;
    const refreshMs = Number(options.refreshMs || 300000);
    const logger = options.logger || console;

    let content = createEmptyContent();
    let matcherData = buildMatcherData(content);
    let lastLoadedAt = null;
    let lastError = null;
    let refreshTimer = null;

    async function refresh() {
        try {
            const response = await fetch(sourceUrl, {
                headers: {
                    "Cache-Control": "no-cache"
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error("Failed to fetch content: " + response.status);
            }

            const rawContent = await response.json();
            content = normalizeContent(rawContent);
            matcherData = buildMatcherData(content);
            lastLoadedAt = new Date().toISOString();
            lastError = null;
            return content;
        } catch (error) {
            lastError = error.message;
            logger.error("[content]", error.message);
            return content;
        }
    }

    async function start() {
        await refresh();

        if (refreshMs > 0) {
            refreshTimer = setInterval(function () {
                refresh().catch(function () {
                    return null;
                });
            }, refreshMs);

            if (typeof refreshTimer.unref === "function") {
                refreshTimer.unref();
            }
        }
    }

    function stop() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    return {
        start: start,
        stop: stop,
        refresh: refresh,
        getContent: function () { return content; },
        getMatcherData: function () { return matcherData; },
        getHealth: function () {
            return {
                sourceUrl: sourceUrl,
                lastLoadedAt: lastLoadedAt,
                lastError: lastError
            };
        }
    };
}

function createEmptyContent() {
    return normalizeContent({});
}

function normalizeContent(data) {
    const next = data && typeof data === "object" ? data : {};

    if (!next.meta || typeof next.meta !== "object") next.meta = {};
    if (!next.contact || typeof next.contact !== "object") next.contact = {};
    if (!next.hero || typeof next.hero !== "object") next.hero = {};
    if (!next.benefits || typeof next.benefits !== "object") next.benefits = {};
    if (!Array.isArray(next.benefits.items)) next.benefits.items = [];
    if (!next.pricing || typeof next.pricing !== "object") next.pricing = {};
    if (!Array.isArray(next.pricing.plans)) next.pricing.plans = [];
    if (!next.faq || typeof next.faq !== "object") next.faq = {};
    if (!Array.isArray(next.faq.items)) next.faq.items = [];
    if (!next.process || typeof next.process !== "object") next.process = {};
    if (!Array.isArray(next.process.steps)) next.process.steps = [];
    if (!next.chatBot || typeof next.chatBot !== "object") next.chatBot = {};

    return next;
}

module.exports = {
    createContentService
};
