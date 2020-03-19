function requestChatBot() {
    const params = new URLSearchParams(location.search);
    const oReq = new XMLHttpRequest();
    oReq.addEventListener("load", initBotConversation);
    var path = "/chatBot";
    if (params['userId']) {
        path += "&userId=" + params['userId'];
    }
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
        domain

    });
    const styleOptions = {
        //botAvatarImage: 'https://docs.microsoft.com/en-us/azure/bot-service/v4sdk/media/logo_bot.svg?view=azure-bot-service-4.0',
        botAvatarInitials: 'Bot',
        // userAvatarImage: '',
        userAvatarInitials: 'You'
    };

    const store = window.WebChat.createStore({}, ({ dispatch }) => next => action => {
        if (action.type === 'DIRECT_LINE/CONNECT_FULFILLED') {

            // Use the following activity to enable an authenticated end user experience
            /*
            dispatch({
                type: 'WEB_CHAT/SEND_EVENT',
                payload: {
                    name: "InitAuthenticatedConversation",
                    value: jsonWebToken
                }
            });
            */

            // Use the following activity to proactively invoke a bot scenario
            
            dispatch({
                type: 'DIRECT_LINE/POST_ACTIVITY',
                meta: {method: 'keyboard'},
                payload: {
                    activity: {
                        type: "invoke",
                        name: "TriggerScenario",
                        value: {
                            trigger: "main"                            
                        }
                    }
                }
            });
            
        }
        return next(action);
    });
    const webchatOptions = {
        directLine: botConnection,
        styleOptions,
        store,
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
