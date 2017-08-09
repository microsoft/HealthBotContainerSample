const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const rp = require("request-promise");

// Initialize the web app instance,
const app = express();

// Indicate which directory static resources
// (e.g. stylesheets) should be served from.
app.use(express.static(path.join(__dirname, "public")));

// begin listening for requests.
const port = process.env.PORT || 3000;
app.listen(port, function() {
    console.log("Express server listening on port " + port);
});

function isUserAuthenticated(){
    // add here the logic to verify the user is authenticated
    return true;
}

function getAnonymizedUserId() {
    // return here the anonymized user id based in the original user id
    return "anonymizedUserId";
}

app.get('/chatBot',  function(req, res) {
    if (!isUserAuthenticated()) {
        res.status(403).send();
        return
    }
    const options = {
        method: 'POST',
        uri: 'https://directline.botframework.com/v3/directline/tokens/generate',
        headers: {
            'Authorization': 'Bearer ' + process.env.WEBCHAT_SECRET
        },
        json: true
    };
    rp(options)
        .then(function (parsedBody) {
            var response = {};
            response['userId'] = getAnonymizedUserId();
            response['connectorToken'] = parsedBody.token;
            response['optionalAttributes'] = {age: 33};
            if (req.params.lat && req.params.long)  {
                response['location'] = {lat: req.params.lat, long: req.params.long};
            }
            const jwtToken = jwt.sign(response, process.env.APP_SECRET);
            res.send(jwtToken);
        })
        .catch(function (err) {
            res.status(err.statusCode).send();
            console.log("failed");
        });
});