require('dotenv').config();
const crypto = require('crypto');
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const fetch = require('node-fetch');
const cookieParser = require('cookie-parser');
const WEBCHAT_SECRET = process.env.WEBCHAT_SECRET;
const DIRECTLINE_ENDPOINT_URI = process.env.DIRECTLINE_ENDPOINT_URI;
const APP_SECRET = process.env.APP_SECRET;
const directLineTokenEp = `https://${DIRECTLINE_ENDPOINT_URI || "directline.botframework.com"}/v3/directline/tokens/generate`;

// Initialize the web app instance,
const app = express();
app.use(cookieParser());

let options = {};
// uncomment the line below if you wish to allow only specific domains to embed this page as a frame
//options = {setHeaders: (res, path, stat) => {res.set('Content-Security-Policy', 'frame-ancestors example.com')}};
// Indicate which directory static resources
// (e.g. stylesheets) should be served from.
app.use(express.static(path.join(__dirname, "public"), options));
// begin listening for requests.
const port = process.env.PORT || 8080;
const region = process.env.REGION || "Unknown";

app.listen(port, function() {
    console.log("Express server listening on port " + port);
});

function isUserAuthenticated(){
    // add here the logic to verify the user is authenticated
    return true;
}

const appConfig = {
    isHealthy : false,
    options : {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + WEBCHAT_SECRET
        }
    }
};

function healthResponse(res, statusCode, message) {
    res.status(statusCode).send({
        health: message,
        region: region
    });
}
function healthy(res) {
    healthResponse(res, 200, "Ok");
}

function unhealthy(res) {
    healthResponse(res, 503, "Unhealthy");
}

app.get('/health', async function(req, res){
    if (!appConfig.isHealthy) {
        try {
            const fetchResponse = await fetch(directLineTokenEp, appConfig.options);
            const parsedBody = await fetchResponse.json();
            appConfig.isHealthy = true;
            healthy(res);
        }
        catch (err) {
            unhealthy(res);
        }
    }
    else {
        healthy(res);
    }
});

app.post('/chatBot',  async function(req, res) {
    if (!isUserAuthenticated()) {
        res.status(403).send();
        return;
    }
    try {
        const fetchResponse = await fetch(directLineTokenEp, appConfig.options);
        const parsedBody = await fetchResponse.json();
        var userid = req.query.userId || req.cookies.userid;
        if (!userid) {
            userid = crypto.randomBytes(4).toString('hex');
            res.cookie("userid", userid, { sameSite: "none", secure: true, httpOnly: true, expires: new Date(new Date().setFullYear(new Date().getFullYear() + 1)) });
        }

        var response = {};
        response['userId'] = userid;
        response['userName'] = req.query.userName;
        response['locale'] = req.query.locale;
        response['connectorToken'] = parsedBody.token;

        /*
        //Add any additional attributes
        response['optionalAttributes'] = {age: 33};
        */

        if (req.query.lat && req.query.long)  {
            response['location'] = {lat: req.query.lat, long: req.query.long};
        }
        response['directLineURI'] = DIRECTLINE_ENDPOINT_URI;
        const jwtToken = jwt.sign(response, APP_SECRET);
        res.send(jwtToken);
    }
    catch (err) {
        appConfig.isHealthy = false;
        res.status(err.statusCode).send();
        console.log("failed");
    }
});
