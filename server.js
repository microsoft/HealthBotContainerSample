const crypto = require('crypto');
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const rp = require("request-promise");
const cookieParser = require('cookie-parser');

// Initialize the web app instance,
const app = express();
app.use(cookieParser());
// Indicate which directory static resources
// (e.g. stylesheets) should be served from.
app.use(express.static(path.join(__dirname, "public")));
// begin listening for requests.
const port = process.env.PORT || 8080;
app.listen(port, function() {
    console.log("Express server listening on port " + port);
});

function isUserAuthenticated(){
    // add here the logic to verify the user is authenticated
    return true;
}

app.get('/chatBot',  function(req, res) {
    if (!isUserAuthenticated()) {
        res.status(403).send();
        return
    }
    var directLineTokenEp = "https://" + process.env.DIRECTLINE_ENDPOINT_URI + "/v3/directline/tokens/generate";
    const options = {
        method: 'POST',
        uri: directLineTokenEp,
        headers: {
            'Authorization': 'Bearer ' + process.env.WEBCHAT_SECRET
        },
        json: true
    };
    rp(options)
        .then(function (parsedBody) {
            var userid = req.query.userId || req.cookies.userid;
            if (!userid) {
                userid = crypto.randomBytes(4).toString('hex');
                res.cookie("userid", userid);
            }

            var response = {};
            response['userId'] = userid;
            response['userName'] = req.query.userName;
            response['connectorToken'] = parsedBody.token;
            if (req.query.lat && req.query.long)  {
                response['location'] = {lat: req.query.lat, long: req.query.long};
            }
            response['directLineURI'] = process.env.DIRECTLINE_ENDPOINT_URI;
            var scnId = process.env.SCENARIO_ID;
            if ( scnId ) {
              response['optionalAttributes'] = {scenarioId: scnId};
              console.log("Scenario ID:" + scnId);
            }
            const jwtToken = jwt.sign(response, process.env.APP_SECRET);
            res.send(jwtToken);
        })
        .catch(function (err) {
            res.status(err.statusCode).send();
            console.log("failed");
        });
});

app.get('/healthz', function(req, res) {
  res.status(200).send();
  return;
});
