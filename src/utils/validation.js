const { HttpError } = require("./errors");

function requireObject(value, fieldName) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new HttpError(400, (fieldName || "body") + " must be a JSON object");
    }

    return value;
}

function normalizeString(value, fieldName, maxLength, options) {
    const settings = options || {};

    if (value === undefined || value === null) {
        return settings.allowEmpty ? "" : null;
    }

    if (typeof value !== "string") {
        throw new HttpError(400, fieldName + " must be a string");
    }

    const text = settings.trim === false ? value : value.trim();

    if (!text) {
        return settings.allowEmpty ? "" : null;
    }

    if (text.length > maxLength) {
        throw new HttpError(400, fieldName + " is too long");
    }

    return text;
}

function requiredString(fieldName, value, maxLength) {
    const normalized = normalizeString(value, fieldName, maxLength || 2048);
    if (!normalized) {
        throw new HttpError(400, fieldName + " is required");
    }

    return normalized;
}

function optionalString(fieldName, value, maxLength) {
    return normalizeString(value, fieldName, maxLength || 2048);
}

function stringOrEmpty(fieldName, value, maxLength) {
    return normalizeString(value, fieldName, maxLength || 4096, { allowEmpty: true });
}

function requiredEnum(fieldName, value, allowedValues) {
    const normalized = requiredString(fieldName, value, 128);
    if (!allowedValues.includes(normalized)) {
        throw new HttpError(400, fieldName + " must be one of: " + allowedValues.join(", "));
    }

    return normalized;
}

function optionalEnum(fieldName, value, allowedValues) {
    const normalized = optionalString(fieldName, value, 128);
    if (normalized === null) {
        return null;
    }

    if (!allowedValues.includes(normalized)) {
        throw new HttpError(400, fieldName + " must be one of: " + allowedValues.join(", "));
    }

    return normalized;
}

function requireTrue(fieldName, value) {
    if (value !== true) {
        throw new HttpError(400, fieldName + " must be true");
    }

    return true;
}

function requiredSessionId(value) {
    const sessionId = requiredString("sessionId", value, 128);
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(sessionId)) {
        throw new HttpError(400, "sessionId format is invalid");
    }

    return sessionId;
}

module.exports = {
    requireObject,
    requiredString,
    optionalString,
    stringOrEmpty,
    requiredEnum,
    optionalEnum,
    requireTrue,
    requiredSessionId
};
