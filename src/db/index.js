const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function createStore(options) {
    const sqlitePath = path.resolve(options.sqlitePath);
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

    const db = new Database(sqlitePath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = NORMAL");

    db.exec([
        "CREATE TABLE IF NOT EXISTS chat_sessions (",
        "  id TEXT PRIMARY KEY,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL,",
        "  source_page TEXT,",
        "  referrer TEXT,",
        "  user_agent TEXT,",
        "  last_message_at TEXT",
        ");",
        "CREATE TABLE IF NOT EXISTS leads (",
        "  id TEXT PRIMARY KEY,",
        "  session_id TEXT NOT NULL UNIQUE,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL,",
        "  status TEXT NOT NULL CHECK(status IN ('new', 'in_progress', 'closed', 'spam')),",
        "  source_page TEXT,",
        "  referrer TEXT,",
        "  user_agent TEXT,",
        "  visitor_name TEXT,",
        "  contact_type TEXT,",
        "  contact_value TEXT,",
        "  first_question TEXT,",
        "  transcript TEXT NOT NULL,",
        "  match_type TEXT,",
        "  internal_note TEXT DEFAULT '',",
        "  telegram_notified_at TEXT,",
        "  FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_leads_status_updated_at ON leads(status, updated_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at DESC);"
    ].join("\n"));

    const statements = {
        upsertChatSession: db.prepare([
            "INSERT INTO chat_sessions (",
            "  id, created_at, updated_at, source_page, referrer, user_agent, last_message_at",
            ") VALUES (",
            "  @id, @created_at, @updated_at, @source_page, @referrer, @user_agent, @last_message_at",
            ")",
            "ON CONFLICT(id) DO UPDATE SET",
            "  updated_at = excluded.updated_at,",
            "  last_message_at = COALESCE(excluded.last_message_at, chat_sessions.last_message_at),",
            "  source_page = COALESCE(NULLIF(excluded.source_page, ''), chat_sessions.source_page),",
            "  referrer = COALESCE(NULLIF(excluded.referrer, ''), chat_sessions.referrer),",
            "  user_agent = COALESCE(NULLIF(excluded.user_agent, ''), chat_sessions.user_agent)"
        ].join("\n")),
        getChatSessionById: db.prepare("SELECT * FROM chat_sessions WHERE id = ?"),
        getLeadById: db.prepare("SELECT * FROM leads WHERE id = ?"),
        getLeadBySessionId: db.prepare("SELECT * FROM leads WHERE session_id = ?"),
        upsertLead: db.prepare([
            "INSERT INTO leads (",
            "  id, session_id, created_at, updated_at, status, source_page, referrer, user_agent,",
            "  visitor_name, contact_type, contact_value, first_question, transcript, match_type,",
            "  internal_note, telegram_notified_at",
            ") VALUES (",
            "  @id, @session_id, @created_at, @updated_at, @status, @source_page, @referrer, @user_agent,",
            "  @visitor_name, @contact_type, @contact_value, @first_question, @transcript, @match_type,",
            "  @internal_note, @telegram_notified_at",
            ")",
            "ON CONFLICT(session_id) DO UPDATE SET",
            "  updated_at = excluded.updated_at,",
            "  status = excluded.status,",
            "  source_page = excluded.source_page,",
            "  referrer = excluded.referrer,",
            "  user_agent = excluded.user_agent,",
            "  visitor_name = excluded.visitor_name,",
            "  contact_type = excluded.contact_type,",
            "  contact_value = excluded.contact_value,",
            "  first_question = excluded.first_question,",
            "  transcript = excluded.transcript,",
            "  match_type = excluded.match_type,",
            "  internal_note = excluded.internal_note,",
            "  telegram_notified_at = excluded.telegram_notified_at"
        ].join("\n")),
        listLeadsAll: db.prepare("SELECT * FROM leads ORDER BY datetime(updated_at) DESC"),
        listLeadsByStatus: db.prepare("SELECT * FROM leads WHERE status = ? ORDER BY datetime(updated_at) DESC"),
        leadCounts: db.prepare([
            "SELECT",
            "  COUNT(*) AS total_all,",
            "  SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS total_new,",
            "  SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS total_in_progress,",
            "  SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS total_closed,",
            "  SUM(CASE WHEN status = 'spam' THEN 1 ELSE 0 END) AS total_spam",
            "FROM leads"
        ].join("\n"))
    };

    function createChatSession(meta) {
        const now = new Date().toISOString();
        const sessionId = crypto.randomUUID();
        upsertChatSession({
            sessionId: sessionId,
            sourcePage: meta.sourcePage,
            referrer: meta.referrer,
            userAgent: meta.userAgent,
            now: now,
            lastMessageAt: null
        });

        return getChatSession(sessionId);
    }

    function upsertChatSession(input) {
        statements.upsertChatSession.run({
            id: input.sessionId,
            created_at: input.now,
            updated_at: input.now,
            source_page: toNullableText(input.sourcePage),
            referrer: toNullableText(input.referrer),
            user_agent: toNullableText(input.userAgent),
            last_message_at: input.lastMessageAt || null
        });
    }

    function getChatSession(sessionId) {
        const row = statements.getChatSessionById.get(sessionId);
        return row ? mapChatSession(row) : null;
    }

    const recordChatExchange = db.transaction(function (input) {
        upsertChatSession({
            sessionId: input.sessionId,
            sourcePage: input.sourcePage,
            referrer: input.referrer,
            userAgent: input.userAgent,
            now: input.now,
            lastMessageAt: input.now
        });

        const currentLead = statements.getLeadBySessionId.get(input.sessionId);
        const transcript = currentLead ? parseTranscript(currentLead.transcript) : [];

        if (!currentLead) {
            transcript.push(createSystemEntry(
                "lead_created",
                "Lead created automatically from the first chat message.",
                { source: "chat_first_message" },
                input.now
            ));
        }

        transcript.push(createUserEntry(input.userMessage, input.now, "message"));
        transcript.push(createBotEntry(input.botReply, input.matchType, input.now));

        const leadRecord = currentLead
            ? cloneLeadRecord(currentLead)
            : createEmptyLeadRecord(input.sessionId, input.now);

        leadRecord.updated_at = input.now;
        leadRecord.status = currentLead ? currentLead.status : "new";
        leadRecord.source_page = firstNonEmpty(currentLead && currentLead.source_page, input.sourcePage);
        leadRecord.referrer = firstNonEmpty(currentLead && currentLead.referrer, input.referrer);
        leadRecord.user_agent = firstNonEmpty(currentLead && currentLead.user_agent, input.userAgent);
        leadRecord.first_question = currentLead && currentLead.first_question
            ? currentLead.first_question
            : input.userMessage;
        leadRecord.transcript = JSON.stringify(transcript);
        leadRecord.match_type = input.matchType || (currentLead && currentLead.match_type) || "fallback";

        statements.upsertLead.run(leadRecord);
        return getLeadBySessionId(input.sessionId);
    });

    const captureLead = db.transaction(function (input) {
        upsertChatSession({
            sessionId: input.sessionId,
            sourcePage: input.sourcePage,
            referrer: input.referrer,
            userAgent: input.userAgent,
            now: input.now,
            lastMessageAt: null
        });

        const currentLead = statements.getLeadBySessionId.get(input.sessionId);
        const transcript = currentLead ? parseTranscript(currentLead.transcript) : [];

        if (!currentLead) {
            transcript.push(createSystemEntry(
                "lead_created",
                "Lead created from the lead form.",
                { source: "chat_lead_form" },
                input.now
            ));
        }

        if (shouldAppendLeadQuestion(currentLead, input.question)) {
            transcript.push(createUserEntry(input.question, input.now, "lead_question"));
        }

        transcript.push(createSystemEntry(
            "lead_submission",
            "Lead details submitted.",
            {
                name: input.name || null,
                contactType: input.contactType,
                contactValue: input.contactValue,
                question: input.question || null,
                consent: input.consent
            },
            input.now
        ));

        const leadRecord = currentLead
            ? cloneLeadRecord(currentLead)
            : createEmptyLeadRecord(input.sessionId, input.now);

        leadRecord.updated_at = input.now;
        leadRecord.status = currentLead ? currentLead.status : "new";
        leadRecord.source_page = firstNonEmpty(currentLead && currentLead.source_page, input.sourcePage);
        leadRecord.referrer = firstNonEmpty(currentLead && currentLead.referrer, input.referrer);
        leadRecord.user_agent = firstNonEmpty(currentLead && currentLead.user_agent, input.userAgent);
        leadRecord.visitor_name = lastNonEmpty(currentLead && currentLead.visitor_name, input.name);
        leadRecord.contact_type = lastNonEmpty(currentLead && currentLead.contact_type, input.contactType);
        leadRecord.contact_value = lastNonEmpty(currentLead && currentLead.contact_value, input.contactValue);
        leadRecord.first_question = currentLead && currentLead.first_question
            ? currentLead.first_question
            : (input.question || null);
        leadRecord.transcript = JSON.stringify(transcript);
        leadRecord.match_type = (currentLead && currentLead.match_type) || input.matchType || "handoff";

        statements.upsertLead.run(leadRecord);
        return getLeadBySessionId(input.sessionId);
    });

    function getLeadBySessionId(sessionId) {
        const row = statements.getLeadBySessionId.get(sessionId);
        return row ? mapLead(row) : null;
    }

    function getLeadById(leadId) {
        const row = statements.getLeadById.get(leadId);
        return row ? mapLead(row) : null;
    }

    function listLeads(status) {
        const rows = !status || status === "all"
            ? statements.listLeadsAll.all()
            : statements.listLeadsByStatus.all(status);

        return {
            items: rows.map(mapLead),
            counts: getLeadCounts()
        };
    }

    function getLeadCounts() {
        const row = statements.leadCounts.get() || {};
        return {
            all: Number(row.total_all || 0),
            new: Number(row.total_new || 0),
            in_progress: Number(row.total_in_progress || 0),
            closed: Number(row.total_closed || 0),
            spam: Number(row.total_spam || 0)
        };
    }

    function updateLeadById(leadId, patch) {
        const currentLead = statements.getLeadById.get(leadId);
        if (!currentLead) {
            return null;
        }

        const leadRecord = cloneLeadRecord(currentLead);
        leadRecord.updated_at = patch.updatedAt || new Date().toISOString();

        if (patch.status !== undefined) {
            leadRecord.status = patch.status;
        }

        if (patch.internalNote !== undefined) {
            leadRecord.internal_note = patch.internalNote;
        }

        statements.upsertLead.run(leadRecord);
        return getLeadById(leadId);
    }

    function markLeadTelegramNotified(leadId, timestamp) {
        const currentLead = statements.getLeadById.get(leadId);
        if (!currentLead) {
            return null;
        }

        const leadRecord = cloneLeadRecord(currentLead);
        leadRecord.telegram_notified_at = timestamp;
        leadRecord.updated_at = timestamp;
        statements.upsertLead.run(leadRecord);
        return getLeadById(leadId);
    }

    function close() {
        db.close();
    }

    return {
        createChatSession: createChatSession,
        getChatSession: getChatSession,
        recordChatExchange: recordChatExchange,
        captureLead: captureLead,
        getLeadBySessionId: getLeadBySessionId,
        getLeadById: getLeadById,
        listLeads: listLeads,
        updateLeadById: updateLeadById,
        markLeadTelegramNotified: markLeadTelegramNotified,
        close: close
    };
}

function createEmptyLeadRecord(sessionId, now) {
    return {
        id: crypto.randomUUID(),
        session_id: sessionId,
        created_at: now,
        updated_at: now,
        status: "new",
        source_page: null,
        referrer: null,
        user_agent: null,
        visitor_name: null,
        contact_type: null,
        contact_value: null,
        first_question: null,
        transcript: "[]",
        match_type: "fallback",
        internal_note: "",
        telegram_notified_at: null
    };
}

function cloneLeadRecord(row) {
    return {
        id: row.id,
        session_id: row.session_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        status: row.status,
        source_page: row.source_page,
        referrer: row.referrer,
        user_agent: row.user_agent,
        visitor_name: row.visitor_name,
        contact_type: row.contact_type,
        contact_value: row.contact_value,
        first_question: row.first_question,
        transcript: row.transcript,
        match_type: row.match_type,
        internal_note: row.internal_note || "",
        telegram_notified_at: row.telegram_notified_at
    };
}

function createSystemEntry(type, text, payload, createdAt) {
    const entry = {
        role: "system",
        type: type,
        text: text,
        createdAt: createdAt
    };

    if (payload) {
        entry.payload = payload;
    }

    return entry;
}

function createUserEntry(text, createdAt, type) {
    return {
        role: "user",
        type: type || "message",
        text: text,
        createdAt: createdAt
    };
}

function createBotEntry(text, matchType, createdAt) {
    return {
        role: "bot",
        type: "reply",
        text: text,
        matchType: matchType,
        createdAt: createdAt
    };
}

function shouldAppendLeadQuestion(currentLead, question) {
    if (!question) {
        return false;
    }

    if (!currentLead || !currentLead.first_question) {
        return true;
    }

    return normalizeCompare(question) !== normalizeCompare(currentLead.first_question);
}

function normalizeCompare(value) {
    return String(value || "").trim().toLowerCase();
}

function parseTranscript(value) {
    try {
        const parsed = JSON.parse(value || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function mapChatSession(row) {
    return {
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sourcePage: row.source_page,
        referrer: row.referrer,
        userAgent: row.user_agent,
        lastMessageAt: row.last_message_at
    };
}

function mapLead(row) {
    return {
        id: row.id,
        sessionId: row.session_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        status: row.status,
        sourcePage: row.source_page,
        referrer: row.referrer,
        userAgent: row.user_agent,
        visitorName: row.visitor_name,
        contactType: row.contact_type,
        contactValue: row.contact_value,
        firstQuestion: row.first_question,
        transcript: parseTranscript(row.transcript),
        matchType: row.match_type,
        internalNote: row.internal_note || "",
        telegramNotifiedAt: row.telegram_notified_at
    };
}

function toNullableText(value) {
    const text = String(value || "").trim();
    return text || null;
}

function firstNonEmpty() {
    for (let index = 0; index < arguments.length; index += 1) {
        const value = toNullableText(arguments[index]);
        if (value) {
            return value;
        }
    }

    return null;
}

function lastNonEmpty() {
    let result = null;

    for (let index = 0; index < arguments.length; index += 1) {
        const value = toNullableText(arguments[index]);
        if (value) {
            result = value;
        }
    }

    return result;
}

module.exports = {
    createStore
};
