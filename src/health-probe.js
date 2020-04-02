const rp = require("request-promise");
const jwt = require('jsonwebtoken');

const settings = {
    region : "Unknown",
}

function setRegion(region) {
    settings.region = region;
}

function healthResponse(res, statusCode, message, details) {
    res.status(statusCode).send({
        health: message,
        details: details,
        region: settings.region
    });
}

function healthy(res) {
    healthResponse(res, 200, "Ok");
}

function unhealthy(res, reason) {
    healthResponse(res, 503, "Unhealthy", reason);
}

function getPostOptions(uri, token) {
    return {
        method: 'POST',
        uri: uri,
        headers: {
            'Authorization': 'Bearer ' + token
        },
        json: true
    };
}

function validateDirectLineSecret(appConfig) {
    return rp(appConfig.options)
        .then((body) => body.token)
        .catch(() => { throw "Unable to verify WEBCHAT_SECRET" });
}

function startConversation(directLineUri, token) {
    const options = getPostOptions(`${directLineUri}/v3/directline/conversations`, token)
    return rp(options)
        .then((body) => body);
}

function generateInitBody(appSecret) {
    const userId = "00001111";
    
    return {
        type: "invoke",
        name: "InitConversation",
        locale: "en-US",
        value: {
            jsonWebToken : jwt.sign({
                userId: userId,
                userName: "you",
                optionalAttributes: {
                }
              }, appSecret)
        },
        channelId: "webchat",
        from: {
            id: userId,
            name: "",
            role: "health-probe"
        },
        timestamp: new Date().toISOString()
    };
}

function initConverationWithSecret(appConfig, response) {
    const conversation = response.conversationId;
    const token = response.token;

    const options = getPostOptions(`${appConfig.directLine}/v3/directline/conversations/${conversation}/activities`, token)
    options.body = generateInitBody(appConfig.appSecret);

    return rp(options);
}

function validateAppSecret(appConfig, token)
{
    const directLineUri = appConfig.directLine;

    return new Promise((resolve,reject) => {
        if (appConfig.appSecret) {
            startConversation(directLineUri, token)
                .then((response) => initConverationWithSecret(appConfig, response))
                .then(() => resolve())
                .catch(() => reject("Unable to verify APP_SECRET"));
        }
        else {
            resolve();
        }
    });
}

function executeHealthProbe(res, appConfig) {
    if (!appConfig.isHealthy) {
        validateDirectLineSecret(appConfig)
            .then((token) => validateAppSecret(appConfig, token))
            .then(() => {
                appConfig.isHealthy = true;
                healthy(res);
            })
            .catch((reason) => unhealthy(res, reason));
    }
    else {
        healthy(res);
    }
}

module.exports = {
    probe : executeHealthProbe,
    setRegion : setRegion
}