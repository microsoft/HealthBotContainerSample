var trigger;
var locale;

function requestChatBot(loc) {
  setTimeout(function () {
    const botLoaderError = document.getElementById('botLoaderError');
    botLoaderError.classList.remove('hidden');
  }, 10000);

  const params = BotChat.queryParams(location.search);
  const oReq = new XMLHttpRequest();
  oReq.addEventListener('load', initBotConversation);
  var path = '/chatBot';
  path += params['userName'] ? '?userName=' + params['userName'] : '?userName=you';

  if (loc) {
    path += '&lat=' + loc.lat + '&long=' + loc.long;
  }
  if (params['userId']) {
    path += '&userId=' + params['userId'];
  }

  oReq.open('POST', path);
  oReq.send();
}

function chatRequested(t) {
  const params = BotChat.queryParams(location.search);
  var shareLocation = params['shareLocation'];
  trigger = t;
  locale = BotChat.queryParams(location.search)['locale'] || 'en';

  if (shareLocation) {
    getUserLocation(requestChatBot);
  } else {
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
        long: longitude,
      };
      callback(location);
    },
    function (error) {
      // user declined to share location
      console.log('location error:' + error.message);
      callback();
    }
  );
}

function sendUserLocation(botConnection, user) {
  getUserLocation(function (location) {
    botConnection.postActivity({ type: 'message', text: JSON.stringify(location), from: user }).subscribe(function (id) {
      console.log('success');
    });
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
  //console.log(tokenPayload.userId + tokenPayload.connectorToken.substr(tokenPayload.connectorToken.length - 15));
  const user = {
    id: tokenPayload.userId,
    name: tokenPayload.userName,
  };
  let domain = undefined;
  if (tokenPayload.directLineURI) {
    domain = 'https://' + tokenPayload.directLineURI + '/v3/directline';
  }
  const botConnection = new BotChat.DirectLine({
    token: tokenPayload.connectorToken,
    domain: domain,
    webSocket: true,
  });
  startChat(user, botConnection);

  // Use the following activity to enable an authenticated end user experience.
  /*
    botConnection.postActivity(
        {type: "event", value: jsonWebToken, from: user, name: "InitAuthenticatedConversation"
    }).subscribe(function (id) {});
    */

  // Use the following activity to proactively invoke a bot scenario.
  botConnection
    .postActivity({
      type: 'invoke',
      locale: locale,
      value: {
        trigger: trigger || 'triage_v2',
      },
      from: user,
      name: 'TriggerScenario',
    })
    .subscribe(function (id) {});

  botConnection.activity$
    .filter(function (activity) {
      return activity.type === 'event' && activity.name === 'shareLocation';
    })
    .subscribe(function (activity) {
      sendUserLocation(botConnection, user);
    });

  botConnection.activity$.subscribe(function (activity) {
    if (activity.type === 'endOfConversation') {
      document.querySelector('.wc-console').style.display = 'none';
    }

    if (activity.type === 'event' && activity.name === 'isFaqMode') {
      const display = !!activity.value ? 'block' : 'none';

      document.querySelector('.wc-console').style.display = display;
    }

    const item = document.querySelector('div[data-activity-id="' + activity.id + '"]');

    if (!!item) {
      item.querySelectorAll('button.ac-pushButton').forEach((x) => {
        x.addEventListener('click', optionSelected);
      });
    }
  });
}

function optionSelected(e) {
  const buttons = e.target.parentNode.childNodes;

  buttons.forEach((x) => {
    x.removeEventListener('click', optionSelected);
    x.disabled = true;
    x.classList.add('c-option');

    if (x === e.target) {
      x.classList.add('c-option--selected');
    }
  });
}

function startChat(user, botConnection) {
  const botContainer = document.getElementById('botContainer');

  var x = BotChat.App(
    {
      botConnection: botConnection,
      user: user,
      locale: locale,
      resize: 'detect',
      chatTitle: '', // title bar is hidden if empty or undefined so set to space
      showUploadButton: false,
    },
    botContainer
  );

  clearOldMessagesIntervalId = setInterval(clearOldMessages, 10);
}

var clearOldMessagesIntervalId;

function clearOldMessages() {
  const botContainer = document.getElementById('botContainer');
  const botLoader = document.getElementById('botLoader');
  var messages = document.querySelector('.wc-message-group-content');

  if (messages && messages.childNodes && messages.childNodes.length >= 1) {
    // once at least one message exists
    // - stop looking for messages
    // - remove everything except the last bot message
    // - show messages and hide loader
    clearInterval(clearOldMessagesIntervalId);
    while (messages.childNodes.length > 1) {
      messages.removeChild(messages.childNodes[0]);
    }
    botContainer.classList.remove('hidden');
    botLoader.classList.add('hidden');
  }
}
