function requestChatBot() {
    const oReq = new XMLHttpRequest();
    oReq.addEventListener("load", initBotConversation);
    var path = "/chatBot";
    oReq.open("POST", path);
    oReq.send();
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
    var botConnection = window.WebChat.createDirectLine({
        token: tokenPayload.connectorToken,
        domain: domain
    });
    const styleOptions = {
        botAvatarImage: 'http://2.bp.blogspot.com/-XREa0Fl9LjI/Us920clfaII/AAAAAAAAAiQ/L2TZqVbxlOA/s1600/Robot3.png',
        // botAvatarInitials: '',
        userAvatarImage: 'https://img.freepik.com/free-vector/illustration-robot-vector-graphic_53876-26790.jpg?size=338&ext=jpg',
        // userAvatarInitials: 'You'
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
                        
                        store.dispatch({
                            type: 'DIRECT_LINE/POST_ACTIVITY',
                            meta: {method: 'keyboard'},
                            payload: {
                                activity: {
                                    type: "event",
                                    name: "TriggerScenario",
                                    value: {
                                        trigger: "covid19_assessment",
                                        args: {}
                                    }
                                }
                            }
                        });
                        
                    }
                    return next(action);
                }
            }
        }
    );

    const webchatOptions = {
        directLine: botConnection,
        store: store,
        styleOptions: styleOptions,
        userID: user.id,
        username: user.name,
        locale: 'en'
    };
    startChat(user, webchatOptions);
}

function startChat(user, webchatOptions) {
    const botContainer = document.getElementById('webchat');
    window.WebChat.renderWebChat(webchatOptions, botContainer);
}
