function requestChatBot(loc) {
    const params = new URLSearchParams(location.search);
    const oReq = new XMLHttpRequest();
    oReq.addEventListener("load", initBotConversation);
    var path = "/chatBot?";
    if (params.has('userId')) {
        path += "&userId=" + params.get('userId');
    }
    if (params.has('locale')) {
        path += "&locale=" + params.get('locale');
    }
    if (loc) {
        path += "&lat=" + loc.lat + "&long=" + loc.long;
    }
    oReq.open("POST", path);
    oReq.send();
}

function chatRequested() {
    const params = new URLSearchParams(location.search);
    if (params.has('shareLocation')) {
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

    let location = undefined;

    if (tokenPayload.location) {
        location = tokenPayload.location;
    }

    let locale = undefined;

    if (tokenPayload.locale) {
        locale=tokenPayload.locale || 'en-us';
    }

    var botConnection = window.WebChat.createDirectLine({
        token: tokenPayload.connectorToken,
        domain: domain,
        webSocket: true
    });

    const styleOptions = {
        botAvatarImage: 'https://docs.microsoft.com/en-us/azure/bot-service/v4sdk/media/logo_bot.svg?view=azure-bot-service-4.0',
        // botAvatarInitials: '',
        // userAvatarImage: '',
        hideSendBox: false, /* set to true to hide the send box from the view */
        botAvatarInitials: 'Bot',
        userAvatarInitials: 'You',
        backgroundColor: '#F8F8F8'
    };

    const store = window.WebChat.createStore(
        {},
        function(store) {
            return function(next) {
                return function(action) {
                    if (action.type === 'DIRECT_LINE/CONNECT_FULFILLED') {
                        
                        // Use the following activity to enable an authenticated end user experience
                        /*
                        store.dispatch({
                            type: 'WEB_CHAT/SEND_EVENT',
                            payload: {
                                name: "InitAuthenticatedConversation",
                                value: jsonWebToken
                            }
                        });
                        */

                        // Use the following activity to proactively invoke a bot scenario
                        /*
                        store.dispatch({
                            type: 'DIRECT_LINE/POST_ACTIVITY',
                            meta: {method: 'keyboard'},
                            payload: {
                                activity: {
                                    type: "invoke",
                                    name: "TriggerScenario",
                                    value: {
                                        trigger: "{scenario_id}",
                                        args: {
                                            location: location,
                                            myVar2: "{custom_arg_2}"
                                        }
                                    }
                                }
                            }
                        });
                        */
                    }
                    return next(action);
                };
            };
        }
    );

    const webchatOptions = {
        directLine: botConnection,
        styleOptions,
        store,
        userID: user.id,
        username: user.name,
        locale: locale
    };

    startChat(user, webchatOptions);
}

function startChat(user, webchatOptions) {
    const botContainer = document.getElementById('webchat');
    window.WebChat.renderWebChat(webchatOptions, botContainer);
}
