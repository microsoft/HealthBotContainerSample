/**
 * This function will get the user location from the browser
 * @param callback
 */
function getUserLocation(callback) {
    navigator.geolocation.getCurrentPosition(
        function(position) {
            var latitude  = position.coords.latitude;
            var longitude = position.coords.longitude;
            var location = {
                lat: latitude,
                long: longitude
            };
            callback(location);
        },
        function(error) {
            // user declined to share location
            console.log("location error:" + error.message);
            callback();
        });
}

/**
 * This function will share location with the bot
 * @param action
 */
function shareLocation(action, store) {
    if (action.type === 'DIRECT_LINE/INCOMING_ACTIVITY') {
        if (action.payload && action.payload.activity && action.payload.activity.type === "event" && action.payload.activity.name === "ShareLocationEvent") {
            // share
            getUserLocation(function (location) {
                store.dispatch({
                    type: 'WEB_CHAT/SEND_POST_BACK',
                    payload: {value: JSON.stringify(location)}
                });
            });

        }
    }
}

/**
 * Use the following to set onclick listener of new buttons in view. This will allow targeting specific CSS for selected buttons.
 */
function markSelectedButtonsOnClick(action) {
    if (action.type === 'DIRECT_LINE/INCOMING_ACTIVITY') {
        setTimeout(function () {
            var ul = document.getElementById("webchat").getElementsByTagName("ul")[1];
            if (!ul) {
                return;
            }
            var untachedButtons = Array.from(ul.getElementsByTagName('button')).filter(function (button) {
                return !button.classList.contains("touched")
            });
            untachedButtons.forEach(function (button) {
                button.classList.add("touched");
                button.addEventListener("click", function () {
                    button.classList.add("button-selected");
                });
            });
        })
    }
}

/**
 * Force scroll down
 */
function forceScrollDown(action) {
    if (action.type === 'DIRECT_LINE/INCOMING_ACTIVITY') {
        setTimeout(function () {
            document.querySelector('div.css-y1c0xs').scrollTop = document.querySelector('div.css-y1c0xs').scrollHeight
        });
    }
}

/**
 * This function will disable all current active inputs and buttons
 */
function disableActiveInputsAndButtons(action) {
    if (action.type === 'WEB_CHAT/SEND_MESSAGE' || action.type === 'WEB_CHAT/SEND_POST_BACK') {
        setTimeout(function () {
            var ul = document.getElementById("webchat").getElementsByTagName("ul")[1];
            if (!ul) {
                return;
            }
            var activeButtons = Array.from(ul.getElementsByTagName('button')).filter(function (button) {
                return !button.hasAttribute("disabled")
            });
            activeButtons.forEach(function (button) {
                button.classList.add("past");
                button.setAttribute("disabled", true);
            });
            var activeInputs = Array.from(ul.getElementsByTagName('input')).filter(function (input) {
                return !button.hasAttribute("disabled")
            });
            activeInputs.forEach(function (button) {
                input.classList.add("past");
                input.setAttribute("disabled", true);
            });
        });
    }

}
