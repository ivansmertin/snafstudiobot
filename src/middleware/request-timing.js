function createRequestTimingMiddleware(options) {
    const logger = options && options.logger ? options.logger : console;

    return function requestTiming(req, res, next) {
        const startedAt = process.hrtime.bigint();

        res.on("finish", function () {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
            logger.log("[request]", req.method, req.originalUrl || req.url, res.statusCode, durationMs.toFixed(1) + "ms");
        });

        next();
    };
}

module.exports = {
    createRequestTimingMiddleware
};
