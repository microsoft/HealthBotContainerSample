const defaultLocale = 'en-US';

function requestChatBot(loc) {
    const params = new URLSearchParams(location.search);
    const oReq = new XMLHttpRequest();
    oReq.addEventListener("load", initBotConversation);
    var path = "/chatBot?locale=" + extractLocale(params.get('locale'));

    if (loc) {
        path += "&lat=" + loc.lat + "&long=" + loc.long;
    }
    if (params.has('userId')) {
        path += "&userId=" + params.get('userId');
    }
    if (params.has('userName')) {
        path += "&userName=" + params.get('userName');
    }
    oReq.open("POST", path);
    oReq.send();
}

function extractLocale(localeParam) {
    if (!localeParam) {
        return defaultLocale;
    }
    else if (localeParam === 'autodetect') {
        return navigator.language;
    }
    else {
        return localeParam;
    }
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
        name: tokenPayload.userName,
        locale: tokenPayload.locale
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
        /* Avatar */
        botAvatarImage: 'https://docs.microsoft.com/en-us/azure/bot-service/v4sdk/media/logo_bot.svg?view=azure-bot-service-4.0', /* set to false to hide the bot avatar */
        // botAvatarInitials: 'Bot',
        // userAvatarImage: '',
        // userAvatarInitials: 'You',

        // SenBox controls
        /*
        hideSendBox: false,         // set to true to hide the entire send box from the view
        hideUploadButton: false,    // set to true to hide the attachment button the view
        */

        // WebChat CSS
        /*
        backgroundColor: '#FFFFFF',
        bubbleBackground: '#FFFFFF',
        bubbleBorderColor: '#B7B7B7',
        bubbleTextColor: '#000000',
        bubbleFromUserBackground: '#FFFFFF',
        bubbleFromUserBorderColor: '#B7B7B7',
        bubbleFromUserTextColor: '#000000'
        */
    };

    const store = window.WebChat.createStore({}, function(store) { return function(next) { return function(action) {
        if (action.type === 'DIRECT_LINE/CONNECT_FULFILLED') {
            store.dispatch({
                type: 'DIRECT_LINE/POST_ACTIVITY',
                meta: {method: 'keyboard'},
                payload: {
                    activity: {
                        type: "invoke",
                        name: "InitConversation",
                        locale: user.locale,
                        value: {
                            // must use for authenticated conversation.
                            jsonWebToken: jsonWebToken,

                            // Use the following activity to proactively invoke a bot scenario
                            /*
                            triggeredScenario: {
                                trigger: "{scenario_id}",
                                args: {
                                    myVar1: "{custom_arg_1}",
                                    myVar2: "{custom_arg_2}"
                                }
                            }
                            */
                        }
                    }
                }
            });
        }

        // Use the following to share location with the bot
        // shareLocation(action, store);

        // Use the following to set onclick listener of new buttons in view. This will allow targeting specific CSS for selected buttons.
        // markSelectedButtonsOnClick(action);


        // Use the following to force scroll chat to the end on new arriving messages from the bot
        // forceScrollDown(action);

        // Use the following code to disable old buttons and inputs from being clickable
        // disableActiveInputsAndButtons(action);
        return next(action);
    }}});
    const webchatOptions = {
        directLine: botConnection,
        styleOptions: styleOptions,
        store: store,
        userID: user.id,
        username: user.name,
        locale: user.locale
    };
    startChat(user, webchatOptions);
}

function startChat(user, webchatOptions) {
    const botContainer = document.getElementById('webchat');
    window.WebChat.renderWebChat(webchatOptions, botContainer);
}
