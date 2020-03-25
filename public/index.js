function requestChatBot(loc) {
    const params = BotChat.queryParams(location.search);
    const oReq = new XMLHttpRequest();
    oReq.addEventListener("load", initBotConversation);
    var path = "/chatBot";
    path += ((params["userName"]) ? "?userName=" + params["userName"] : "?userName=you");
    if (loc) {
        path += "&lat=" + loc.lat + "&long=" + loc.long;
    }
    if (params['userId']) {
        path += "&userId=" + params['userId'];
    }
    oReq.open("POST", path);
    oReq.send();
}

function chatRequested() {
    const params = BotChat.queryParams(location.search);
    var shareLocation = params["shareLocation"];
    if (shareLocation) {
        getUserLocation(requestChatBot);
    }
    else {
        requestChatBot();
    }
}

function getUserLocation(callback) {
    navigator.geolocation.getCurrentPosition(
        function(position) {
            var latitude  = position.coords.latitude;
            var longitude = position.coords.longitude;
            var location = {
                lat: latitude,
                long: longitude
            }
            callback(location);
        },
        function(error) {
            // user declined to share location
            console.log("location error:" + error.message);
            callback();
        });
}

function sendUserLocation(botConnection, user) {
    getUserLocation(function (location) {
        botConnection.postActivity({type: "message", text: JSON.stringify(location), from: user}).subscribe(function (id) {console.log("success")});
    });
}

function initBotConversation() {
    if (this.status >= 400) {
        alert(this.statusText);
        return;
    }
    // extract the data from the JWT
    const jsonWebToken = this.response;
    const tokenPayload = JSON.parse(atob(jsonWebToken.split('.')[1]));
    const user = {
        id: tokenPayload.userId,
        name: tokenPayload.userName
    };
    let domain = undefined;
    if (tokenPayload.directLineURI) {
        domain =  "https://" +  tokenPayload.directLineURI + "/v3/directline";
    }
    const botConnection = new BotChat.DirectLine({
        token: tokenPayload.connectorToken,
        domain: domain,
        webSocket: true
    });
    startChat(user, botConnection);

    const params = BotChat.queryParams(location.search);
    const locale = params['locale'] || 'en_us';

    // Use the following activity to enable an authenticated end user experience.
    /*
    botConnection.postActivity(
        {type: "event", value: jsonWebToken, from: user, name: "InitAuthenticatedConversation"
    }).subscribe(function (id) {});
    */

    // Use the following activity to proactively invoke a bot scenario. 
    /*
    botConnection.postActivity({
        type: "invoke",
        value: {
            trigger: "{scenario}",
            args: {
                myVar1: "{custom_arg_1}",
                myVar2: "{custom_arg_2}"
            }
        },
        from: user,
        name: "TriggerScenario",
        locale: params['locale']
    }).subscribe(function(id) {});
    */

    botConnection.activity$
        .filter(function (activity) {return activity.type === "event" && activity.name === "shareLocation"})
        .subscribe(function (activity) {sendUserLocation(botConnection, user)});
}

function startChat(user, botConnection) {
    const botContainer = document.getElementById('botContainer');
    botContainer.classList.add("wc-display");
    const params = BotChat.queryParams(location.search);
    const locale = params['locale'] || 'en_us';

    BotChat.App({
        botConnection: botConnection,
        user: user,
        locale: locale,
        resize: 'detect'
        // sendTyping: true,    // defaults to false. set to true to send 'typing' activities to bot (and other users) when user is typing
    }, botContainer);
}
