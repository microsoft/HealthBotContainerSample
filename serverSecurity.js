const rateLimit = require('express-rate-limit');

// Browsers always send Sec-Fetch-Site; non-browser clients (curl, server-to-server) don't, so they pass.
// Only "cross-site" is rejected so the sample still works when embedded in an iframe on another domain.
function rejectCrossSite(req, res, next) {
    if (req.headers['sec-fetch-site'] === 'cross-site') {
        res.status(403).send();
        return;
    }
    next();
}

function createLimiter(options = {}) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        standardHeaders: true,
        legacyHeaders: false,
        ...options
    });
}

function readCookie(req, name) {
    const header = req.headers.cookie;
    if (!header) {
        return undefined;
    }
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index > 0 && part.slice(0, index).trim() === name) {
            try {
                return decodeURIComponent(part.slice(index + 1).trim());
            } catch (err) {
                return undefined;
            }
        }
    }
    return undefined;
}

module.exports = { rejectCrossSite, createLimiter, readCookie };
