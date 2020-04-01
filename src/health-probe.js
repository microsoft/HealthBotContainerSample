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

function executeHealthProbe(res, appConfig) {
    if (!appConfig.isHealthy) {
        rp(appConfig.options)
            .then((body) => {
                appConfig.isHealthy = true;
                healthy(res);
            })
            .catch((err) =>{
                unhealthy(res);
            });
    }
    else {
        healthy(res);
    }
}

module.exports = {
    probe : executeHealthProbe,
    setRegion : setRegion
}