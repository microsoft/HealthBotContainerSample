const defaultLocale = 'en-US';
const disableClickedButtons = true;

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
        botAvatarImage: 'https://docs.microsoft.com/en-us/azure/bot-service/v4sdk/media/logo_bot.svg?view=azure-bot-service-4.0',
        // botAvatarInitials: '',
        // userAvatarImage: '',
        hideSendBox: false, /* set to true to hide the send box from the view */
        botAvatarInitials: 'Bot',
        userAvatarInitials: 'You',
        backgroundColor: '#F8F8F8'
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
        else if (action.type === 'DIRECT_LINE/INCOMING_ACTIVITY') {
            if (action.payload && action.payload.activity && action.payload.activity.type === "event" && action.payload.activity.name === "ShareLocationEvent") {
                // share
                getUserLocation(function (location) {
                    store.dispatch({
                        type: 'WEB_CHAT/SEND_POST_BACK',
                        payload: { value: JSON.stringify(location) }
                    });
                });
            }
        }
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

//Entry point. Begin execution when html loaded.
document.addEventListener("DOMContentLoaded", listenChatDIV);

//This function is used to listen for content changes in "webchat" DIV and react on updates
function listenChatDIV(){
    var mutationObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            //Listen for changes in unsorted list, that holds dialog pieces, returned by bot or user
            if(mutation.target.nodeName === "UL"){
                processChanges();
            }
        });
    });

    //listen only for child nodes changes in an element tree
    var trackedElement = document.getElementById("webchat");
    if(trackedElement != null){
        mutationObserver.observe(trackedElement, {
            attributes: false,
            characterData: false,
            childList: true,
            subtree: true,
            attributeOldValue: false,
            characterDataOldValue: false
        });
    }
}

function processChanges(){
    //Hide user input control if buttons are displayed
    var listItems = document.querySelectorAll('[role="listitem"]');

    if(listItems.length > 0) {
        var lastListItem = listItems[listItems.length - 1];
        var buttonsInLastListItem = lastListItem.getElementsByTagName('button');
        var isUserMessage = lastListItem.getElementsByClassName("webchat__initialsAvatar--fromUser").length > 0;

        if(!isUserMessage){
            if(buttonsInLastListItem.length > 0) {
                //For the buttons in a last UL item
                for (let i = 0; i < buttonsInLastListItem.length; i++) {
                    //Add handler, if it not yet set for this button
                    if(disableClickedButtons && !buttonsInLastListItem[i].classList.contains("event-set")) {
                        buttonsInLastListItem[i].addEventListener("click", disableButtons);
                        buttonsInLastListItem[i].classList.add("event-set");
                    }

                    if(buttonsInLastListItem[i].childNodes.length > 0 && buttonsInLastListItem[i].childNodes[0].nodeName == "DIV"){
                        buttonsInLastListItem[i].childNodes[0].style.cssText = "";
                    }
                }
            }
        }
    }
}

function disableButtons(targetButtonEvent)
{
    //let's try to find a button we clicked on
    var targetButton = targetButtonEvent.target;
    //Go up to buttons parent node
    var parentDiv = targetButton.parentNode;
    //Let's disable child buttons in parent node
    for (let i = 0; i < parentDiv.childNodes.length; i++) {
        var childNode = parentDiv.childNodes[i];
        if(childNode.nodeName == "BUTTON"){
            disableButton(childNode, childNode == targetButton);
        }
    }
}

function disableButton(button, isClicked){
    button.classList.add(isClicked ? "clicked-disabled" : "not-clicked-disabled");
    //Remove events, change cursor and disable button
    button.removeEventListener("click", disableButtons);
    button.onclick = "null";
    button.disabled = true;
}
