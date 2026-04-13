const STOP_WORDS = new Set([
    "и", "в", "во", "на", "с", "со", "по", "к", "ко", "что", "как", "для", "или",
    "у", "из", "об", "от", "до", "не", "ли", "я", "мы", "вы", "мне", "нужно",
    "это", "этот", "эта", "есть", "про", "под", "над", "же", "а", "но", "бы",
    "быть", "могу", "можно", "вам", "нас", "вас", "мой", "моя", "мое", "где",
    "когда", "тут", "там", "уже", "еще", "ещё", "если"
]);

const PRICE_PATTERNS = [
    "стоимость",
    "цена",
    "цены",
    "сколько стоит",
    "сколько будет",
    "бюджет",
    "прайс",
    "прайсу",
    "прайс лист"
];

const TIMELINE_PATTERNS = [
    "срок",
    "сроки",
    "по времени",
    "сколько по времени",
    "сколько времени",
    "за сколько",
    "когда будет готово",
    "дней",
    "недель"
];

const SERVICE_PATTERNS = [
    "что вы делаете",
    "что делаете",
    "чем можете помочь",
    "услуги",
    "какие услуги",
    "что умеете",
    "лендинг",
    "сайт",
    "корпоративный сайт",
    "доработка сайта"
];

const CONTACT_PATTERNS = [
    "телеграм",
    "telegram",
    "контакт",
    "контакты",
    "как связаться",
    "почта",
    "email",
    "телефон"
];

const HANDOFF_PATTERNS = [
    "нужен",
    "интересует",
    "хочу",
    "заказать",
    "проект",
    "задача",
    "обсудить",
    "сделать сайт"
];

function createChatResponder(options) {
    const contentService = options.contentService;

    function generateReply(message) {
        const content = contentService.getContent() || {};
        const normalizedMessage = normalize(message);
        const tokens = tokenize(message);

        if (hasAny(normalizedMessage, PRICE_PATTERNS)) {
            return {
                reply: buildPricingReply(content),
                matchType: "pricing",
                nextStep: "offer_lead",
                showLeadCta: true
            };
        }

        if (hasAny(normalizedMessage, TIMELINE_PATTERNS)) {
            return {
                reply: buildTimelineReply(content),
                matchType: "faq",
                nextStep: "offer_lead",
                showLeadCta: true
            };
        }

        if (hasAny(normalizedMessage, SERVICE_PATTERNS)) {
            return {
                reply: buildServicesReply(content),
                matchType: "faq",
                nextStep: "offer_lead",
                showLeadCta: true
            };
        }

        if (hasAny(normalizedMessage, CONTACT_PATTERNS)) {
            return {
                reply: buildContactReply(content),
                matchType: "faq",
                nextStep: "offer_lead",
                showLeadCta: true
            };
        }

        const faqMatch = findBestFaqMatch(tokens, content);
        if (faqMatch && faqMatch.score >= 2) {
            return {
                reply: condenseText(faqMatch.item.answer, 320),
                matchType: "faq",
                nextStep: "offer_lead",
                showLeadCta: true
            };
        }

        if (hasAny(normalizedMessage, HANDOFF_PATTERNS) || tokens.length >= 5) {
            return {
                reply: buildHandoffReply(content),
                matchType: "handoff",
                nextStep: "capture_lead",
                showLeadCta: true
            };
        }

        return {
            reply: buildFallbackReply(content),
            matchType: "fallback",
            nextStep: "capture_lead",
            showLeadCta: true
        };
    }

    return {
        generateReply: generateReply
    };
}

function buildPricingReply(content) {
    const pricing = content.pricing || {};
    const parts = [];

    if (pricing.subtitle) {
        parts.push(stripHtml(pricing.subtitle));
    } else {
        parts.push("Стоимость зависит от количества и сложности блоков.");
    }

    const planSummary = Array.isArray(pricing.plans)
        ? pricing.plans.slice(0, 3).filter(function (plan) {
            return plan && plan.name && plan.price;
        }).map(function (plan) {
            return plan.name + " - " + plan.price;
        }).join("; ")
        : "";

    if (planSummary) {
        parts.push("Ориентиры: " + planSummary + ".");
    }

    if (pricing.note) {
        parts.push(stripHtml(pricing.note));
    } else {
        parts.push("Если хотите, оставьте контакт в чате, и я помогу быстро оценить ваш проект точнее.");
    }

    return condenseText(parts.join(" "), 320);
}

function buildTimelineReply(content) {
    const faqItems = getFaqItems(content);
    const faqItem = faqItems.find(function (item) {
        const question = normalize(item.question);
        return question.indexOf("по времени") !== -1 || question.indexOf("занимает проект") !== -1;
    });

    if (faqItem) {
        return condenseText(faqItem.answer, 320);
    }

    const steps = Array.isArray(content.process && content.process.steps)
        ? content.process.steps
        : [];

    if (!steps.length) {
        return "Срок зависит от объема проекта, контента и количества согласований. Если оставите короткое описание задачи, смогу точнее сориентировать по времени.";
    }

    return condenseText(
        "Срок зависит от объема проекта и согласований. Обычно работа проходит через этапы: " +
        steps.map(function (step) { return step.title; }).filter(Boolean).join(", ") +
        ". Если хотите, оставьте контакт, и я оценю сроки под вашу задачу.",
        320
    );
}

function buildServicesReply(content) {
    const faqItems = getFaqItems(content);
    const faqItem = faqItems.find(function (item) {
        return normalize(item.question).indexOf("чем вы можете помочь") !== -1;
    });

    if (faqItem) {
        return condenseText(faqItem.answer, 320);
    }

    const heroPoints = Array.isArray(content.hero && content.hero.points)
        ? content.hero.points.filter(Boolean)
        : [];

    const benefits = Array.isArray(content.benefits && content.benefits.items)
        ? content.benefits.items.slice(0, 3).map(function (item) { return item.title; }).filter(Boolean)
        : [];

    const summary = heroPoints.length ? heroPoints : benefits;

    if (summary.length) {
        return condenseText(
            "СНАФ СТУДИЯ помогает с такими задачами: " + summary.join(", ") +
            ". Если расскажете о проекте подробнее, я подскажу оптимальный формат работы.",
            320
        );
    }

    return condenseText(
        stripHtml((content.hero && content.hero.subtitle) || "Помогаю с лендингами, корпоративными сайтами, дизайном и аккуратной адаптивной версткой."),
        320
    );
}

function buildContactReply(content) {
    const contact = content.contact || {};
    const parts = [];

    if (contact.telegram) parts.push("Telegram: " + contact.telegram);
    if (contact.phone) parts.push("Телефон: " + contact.phone);
    if (contact.email) parts.push("Email: " + contact.email);

    if (!parts.length) {
        return "Можно оставить заявку прямо в чате: я увижу ее в inbox админки и смогу связаться с вами вручную.";
    }

    return condenseText(
        "Связаться можно так: " + parts.join("; ") +
        ". Либо оставьте контакт в чате, и заявка сразу попадет в inbox.",
        320
    );
}

function buildHandoffReply(content) {
    const chatBot = content.chatBot || {};
    return condenseText(
        stripHtml(chatBot.capturePrompt || "Понял запрос. Оставьте имя и удобный контакт, и я передам вашу задачу в работу."),
        320
    );
}

function buildFallbackReply(content) {
    const chatBot = content.chatBot || {};
    return condenseText(
        stripHtml(chatBot.capturePrompt || "Могу помочь с вопросами по стоимости, срокам и формату работы. Если хотите, оставьте контакт, и я отвечу точнее по вашей задаче."),
        320
    );
}

function findBestFaqMatch(tokens, content) {
    const faqItems = getFaqItems(content);
    let bestMatch = null;

    faqItems.forEach(function (item) {
        const questionTokens = tokenize(item.question || "");
        const answerTokens = tokenize(item.answer || "");
        let score = 0;

        tokens.forEach(function (token) {
            if (questionTokens.includes(token)) {
                score += 2;
            } else if (answerTokens.includes(token)) {
                score += 1;
            }
        });

        if (!bestMatch || score > bestMatch.score) {
            bestMatch = { item: item, score: score };
        }
    });

    return bestMatch;
}

function getFaqItems(content) {
    return Array.isArray(content.faq && content.faq.items)
        ? content.faq.items
        : [];
}

function tokenize(text) {
    return normalize(text)
        .split(/\s+/)
        .filter(function (token) {
            return token && token.length > 2 && !STOP_WORDS.has(token);
        });
}

function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripHtml(text) {
    return String(text || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function condenseText(text, maxLength) {
    const clean = stripHtml(text);
    if (clean.length <= maxLength) {
        return clean;
    }

    const sentences = clean.split(/(?<=[.!?])\s+/);
    let result = "";

    sentences.forEach(function (sentence) {
        const next = result ? result + " " + sentence : sentence;
        if (next.length <= maxLength) {
            result = next;
        }
    });

    if (result) {
        return result;
    }

    return clean.slice(0, Math.max(0, maxLength - 3)).trimEnd() + "...";
}

function hasAny(text, patterns) {
    return patterns.some(function (pattern) {
        return text.indexOf(pattern) !== -1;
    });
}

module.exports = {
    createChatResponder
};
