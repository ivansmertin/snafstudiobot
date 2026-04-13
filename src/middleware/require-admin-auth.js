const { HttpError } = require("../utils/errors");

function createRequireAdminAuth(options) {
    const adminSessionService = options.adminSessionService;

    return function requireAdminAuth(req, res, next) {
        const token = req.cookies[adminSessionService.cookieName];
        const session = adminSessionService.verifySessionToken(token);

        if (!session) {
            next(new HttpError(401, "Admin session required"));
            return;
        }

        req.admin = session;
        next();
    };
}

module.exports = {
    createRequireAdminAuth
};
