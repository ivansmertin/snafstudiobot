const express = require("express");

function createHealthRouter(options) {
    const router = express.Router();
    const contentService = options.contentService;

    router.get("/health", function (req, res) {
        res.json({
            ok: true,
            content: contentService.getHealth()
        });
    });

    return router;
}

module.exports = {
    createHealthRouter
};
