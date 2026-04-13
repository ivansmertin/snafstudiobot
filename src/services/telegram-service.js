function createTelegramService(options) {
    const botToken = options.botToken;
    const chatId = options.chatId;
    const adminAppUrl = options.adminAppUrl;

    function isEnabled() {
        return Boolean(botToken && chatId);
    }

    async function notifyLeadCaptured(lead) {
        if (!isEnabled()) {
            return false;
        }

        const lines = [
            "New lead from snafstudio.ru",
            "",
            "Name: " + (lead.visitorName || "Not provided"),
            "Contact: " + ((lead.contactType || "-") + " - " + (lead.contactValue || "-")),
            "First question: " + (lead.firstQuestion || "Not provided"),
            "Source page: " + (lead.sourcePage || "/"),
            "Created at: " + (lead.createdAt || new Date().toISOString())
        ];

        if (adminAppUrl) {
            lines.push("", "Admin: " + adminAppUrl);
        }

        const response = await fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: lines.join("\n"),
                disable_web_page_preview: true
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            throw new Error("Telegram API error: " + response.status);
        }

        return true;
    }

    return {
        isEnabled: isEnabled,
        notifyLeadCaptured: notifyLeadCaptured
    };
}

module.exports = {
    createTelegramService
};
