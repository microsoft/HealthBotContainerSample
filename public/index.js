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

    let localefromtoken = undefined;

    if (tokenPayload.locale) {
        localefromtoken=tokenPayload.locale;
    }

    const locale = localefromtoken || 'en-us';

    var botConnection = window.WebChat.createDirectLine({
        token: tokenPayload.connectorToken,
        domain: domain,
        webSocket: true
    });

    const styleOptions = {
        botAvatarImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Cartoon_Robot.svg/512px-Cartoon_Robot.svg.png',
        botAvatarBackgroundColor: '#1abc9c',
        //botAvatarInitials: 'Bot',
        userAvatarImage: 'https://cdn3.iconfinder.com/data/icons/cardiovascular-1/120/heart_patient-512.png',
        userAvatarBackgroundColor: '#1abc9c',
        //userAvatarInitials: 'You'
        avatarSize: 60,
    };

    const store = window.WebChat.createStore(
        {},
        function(store) {
            return function(next) {
                return function(action) {
                    if (action.type === 'DIRECT_LINE/CONNECT_FULFILLED') {
                        
                        store.dispatch({
                            type: 'DIRECT_LINE/POST_ACTIVITY',
                            meta: {method: 'keyboard'},
                            payload: {
                                activity: {
                                    type: "invoke",
                                    name: "TriggerScenario",
                                    value: {
                                        trigger: "covid19_assessment",
                                        args: {
                                            location: location
                                        }
                                    }
                                }
                            }
                        });
                    }
                    return next(action);
                };
            };
        }
    );

    const localfromrequest = locale;
    const locale2 = 'es-es';

    const webchatOptions = {
        directLine: botConnection,
        styleOptions,
        store,
        userID: user.id,
        username: user.name,
        locale: locale2
    };

    startChat(user, webchatOptions);
}

function startChat(user, webchatOptions) {
    const botContainer = document.getElementById('webchat');
    window.WebChat.renderWebChat(webchatOptions, botContainer);
}
