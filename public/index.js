function requestChatBot(loc) {
    const params = BotChat.queryParams(location.search);
    const oReq = new XMLHttpRequest();
    oReq.addEventListener("load", initBotConversation);
    var path = "/chatBot";
    path += ((params["userName"]) ? "?userName=" + params["userName"] : "?userName=" + Math.random().toString(36).slice(2));
    // path += ((params["userName"]) ? "?userName=" + params["userName"] : "?userName=you");
    console.log('Path:' + path);
    if (loc) {
        path += "&lat=" + loc.lat + "&long=" + loc.long;
    }
    if (params['userId']) {
        path += "&userId=" + params['userId'];
    }
    oReq.open("GET", path);
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
    let attrs = tokenPayload.optionalAttributes;
    const botConnection = new BotChat.DirectLine({
        token: tokenPayload.connectorToken,
        domain,
        webSocket: true
    });
    startChat(user, botConnection);
    botConnection.postActivity({type: "event", value: jsonWebToken, from: user, name: "InitAuthenticatedConversation"}).subscribe(function (id) {});
    if (attrs.scenarioId) {
      console.log("ScenarioId : " + attrs.scenarioId);
      botConnection.postActivity({type: "event", value: {trigger: String(attrs.scenarioId)},from:user,name:"BeginDebugScenario"}).subscribe(function (id){});
    }
    botConnection.activity$
        .filter(function (activity) {return activity.type === "event" && activity.name === "shareLocation"})
        .subscribe(function (activity) {sendUserLocation(botConnection, user)});

    // disable the upload label and button's
    let x = document.getElementsByClassName("wc-console has-upload-button");
    if (x !== null && x.length > 0) { x[0].style.display = "none"; }
    
    /** Alternate way to disable the upload attachment label and control
    // Upload label
    var uploadLabel = document.querySelector(".wc-upload");
    if (uploadLabel) {
      console.log("Found Label");
      uploadLabel.remove();
    }
    else console.log("label not found");

    // Upload button
    var uploadButton = document.getElementById("wc-upload-input");
    if (uploadButton) {
      console.log("Found it");
      uploadButton.remove();
    }
    else console.log('button not found!');

    // Disable the input field
    var shellInput = document.querySelector(".wc-shellinput");
    shellInput.disabled = true; */

    // Add the 'x' close button in the header to allow user to exit the chat window
    var chatHdr = document.querySelector(".wc-header");
    var closeButton = document.createElement("button");
    closeButton.style.float = "right";
    closeButton.innerText = "X";
    closeButton.onclick = function() {
      // botConnection.postActivity({type: "message", text: "Start Over", from: user}).subscribe(function (id) { console.log("Reinit Conv.") });

      window.parent.deleteChatWindow();
    };
    chatHdr.childNodes[0].append(closeButton);
}

function startChat(user, botConnection) {
    const botContainer = document.getElementById('botContainer');
    botContainer.classList.add("wc-display");

    BotChat.App({
        botConnection: botConnection,
        user: user,
        locale: 'en',
        resize: 'detect'
        // sendTyping: true,    // defaults to false. set to true to send 'typing' activities to bot (and other users) when user is typing
    }, botContainer);
}
