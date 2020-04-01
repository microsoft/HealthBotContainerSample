const rp = require("request-promise");

const settings = {
    region : "Unknown",
}

function setRegion(region) {
    settings.region = region;
}

function healthResponse(res, statusCode, message) {
    res.status(statusCode).send({
        health: message,
        region: settings.region
    });
}

function healthy(res) {
    healthResponse(res, 200, "Ok");
}

function unhealthy(res) {
    healthResponse(res, 503, "Unhealthy");
}

function validateDirectLineSecret(appConfig) {
    return rp(appConfig.options);
}

function executeHealthProbe(res, appConfig) {
    if (!appConfig.isHealthy) {
        validateDirectLineSecret(appConfig)
            .then(() => {
                appConfig.isHealthy = true;
                healthy(res);
            })
            .catch(() => unhealthy(res));
    }
    else {
        healthy(res);
    }
}

module.exports = {
    probe : executeHealthProbe,
    setRegion : setRegion
}