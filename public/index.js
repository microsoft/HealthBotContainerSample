function requestChatBot(loc) {
    setTimeout(function () {
        const botLoaderError = document.getElementById('botLoaderError');
        botLoaderError.classList.remove("hidden");
    }, 10000);

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
    // var userId = Math.floor(Math.random() * 10000000000);
    // path += "&userId=" + userId;

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
        function (position) {
            var latitude = position.coords.latitude;
            var longitude = position.coords.longitude;
            var location = {
                lat: latitude,
                long: longitude
            }
            callback(location);
        },
        function (error) {
            // user declined to share location
            console.log("location error:" + error.message);
            callback();
        });
}

function sendUserLocation(botConnection, user) {
    getUserLocation(function (location) {
        botConnection.postActivity({ type: "message", text: JSON.stringify(location), from: user }).subscribe(function (id) { console.log("success") });
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
    console.log(tokenPayload.userId + tokenPayload.connectorToken.substr(tokenPayload.connectorToken.length - 15));
    const user = {
        id: tokenPayload.userId,
        name: tokenPayload.userName
    };
    let domain = undefined;
    if (tokenPayload.directLineURI) {
        domain = "https://" + tokenPayload.directLineURI + "/v3/directline";
    }
    const botConnection = new BotChat.DirectLine({
        token: tokenPayload.connectorToken,
        domain: domain,
        webSocket: true
    });
    startChat(user, botConnection);

    // Use the following activity to enable an authenticated end user experience.
    /*
    botConnection.postActivity(
        {type: "event", value: jsonWebToken, from: user, name: "InitAuthenticatedConversation"
    }).subscribe(function (id) {});
    */

    // Use the following activity to proactively invoke a bot scenario. 
    botConnection.postActivity({
        type: "invoke",
        value: {
            trigger: "triage"
        },
        from: user,
        name: "TriggerScenario"
    }).subscribe(function (id) { });


    botConnection.activity$
        .filter(function (activity) { return activity.type === "event" && activity.name === "shareLocation" })
        .subscribe(function (activity) { sendUserLocation(botConnection, user) });

    setInterval(function () {
        // remove all buttons except the selected one, change its color, and make unclickable
        var buttons = document.getElementsByClassName("ac-pushButton");
        for (let i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener("click", selectOption);
        }
    }, 10);
}

function startChat(user, botConnection) {
    const botContainer = document.getElementById('botContainer');

    var x = BotChat.App({
        botConnection: botConnection,
        user: user,
        locale: 'en',
        resize: 'detect',
        chatTitle: ' ' // title bar is hidden if empty or undefined so set to space
        // sendTyping: true,    // defaults to false. set to true to send 'typing' activities to bot (and other users) when user is typing
    }, botContainer);

    clearOldMessagesIntervalId = setInterval(clearOldMessages, 10);
}

var clearOldMessagesIntervalId;

function clearOldMessages() {
    const botContainer = document.getElementById('botContainer');
    const botLoader = document.getElementById('botLoader');
    var messages = document.querySelector(".wc-message-group-content");

    if (messages && messages.childNodes && messages.childNodes.length >= 1) {
        // once at least one message exists
        // - stop looking for messages
        // - remove everything except the last bot message
        // - show messages and hide loader
        clearInterval(clearOldMessagesIntervalId);
        while (messages.childNodes.length > 1) {
            messages.removeChild(messages.childNodes[0]);
        }
        botContainer.classList.remove("hidden");
        botLoader.classList.add("hidden");
    }
}

function nodeIsPrivacyMessage(node) {

}

function selectOption(event) {
    disableButtons(event.target);
}

function nonSelectedButton(button) {
    button.style.backgroundColor = "#f3f3f3";
    button.style.color = "#cccccc";
    button.style.borderColor = "#cccccc";
}

function selectedButton(button) {
    button.style.backgroundColor = "#337cb3";
    button.style.color = "white";
    button.style.borderColor = "#cccccc";
}

function disableButtons(targetButton) {
    selectedButton(targetButton);
    targetButton.classList.add("old-button");
    targetButton.parentNode.parentNode.parentNode.parentNode.style.cursor = "not-allowed";
    var allChildren = targetButton.parentNode.childNodes;
    for (let i = 0; i < allChildren.length; i++) {
        if (allChildren[i].innerText) {
            if (allChildren[i].innerText !== targetButton.innerText) {
                nonSelectedButton(allChildren[i]);
            }
            allChildren[i].classList.remove("ac-pushButton");
            allChildren[i].classList.add("old-button");
            allChildren[i].onclick = "null";
            allChildren[i].removeEventListener("click", selectOption);
            allChildren[i].style.outline = "none";
            allChildren[i].style.cursor = "not-allowed";
        }
    }
}
