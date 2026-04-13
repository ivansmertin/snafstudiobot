const { HttpError } = require("./errors");

function asyncHandler(handler) {
    return function wrappedHandler(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function notFound(req, res, next) {
    next(new HttpError(404, "Route not found"));
}

function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        next(error);
        return;
    }

    const statusCode = Number(error && error.statusCode) || Number(error && error.status) || 500;
    const message = statusCode >= 500
        ? "Internal server error"
        : (error && error.message) || "Request failed";

    if (statusCode >= 500) {
        console.error("[server]", error);
    }

    const payload = { error: message };
    if (error && error.details && statusCode < 500) {
        payload.details = error.details;
    }

    res.status(statusCode).json(payload);
}

module.exports = {
    asyncHandler,
    notFound,
    errorHandler
};
