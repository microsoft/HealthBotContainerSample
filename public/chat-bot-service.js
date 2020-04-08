var SessionToken = /** @class */ (function () {
    function SessionToken(callback) {
        var _this = this;
        this.value = '';
        this.head = null;
        this.payload = null;
        this.hash = '';
        this.constructorCallback = null;
        this.constructorCallback = callback;
        var request = new XMLHttpRequest();
        request.addEventListener('load', function (x) { return _this.response(_this, x); });
        request.open('POST', '/chatBot');
        request.send();
    }
    SessionToken.prototype.response = function (context, response) {
        context.value = response.target.responseText;
        if (!context.value) {
            return;
        }
        var segments = context.value.split('.');
        context.head = this.parse(segments[0]);
        context.payload = this.parse(segments[1]);
        context.hash = segments[2];
        context.constructorCallback(context);
    };
    SessionToken.prototype.parse = function (value) {
        var decodedValue = atob(value);
        var result = JSON.parse(decodedValue);
        return result;
    };
    return SessionToken;
}());
var BuildUser = function (id) {
    return {
        id: id,
        name: 'you',
        role: 'user',
    };
};
var BuildBotConnection = function (connectorToken, settings) {
    return {
        token: connectorToken,
        domain: settings.domain,
        webSocket: settings.webSocket,
    };
};
var BuildBotChatAppSettings = function (connection, user, settings) {
    return {
        botConnection: connection,
        user: user,
        locale: settings.locale,
        resize: settings.resize,
        chatTitle: settings.chatTitle,
        showUploadButton: settings.showUploadButton,
    };
};
var BuildActivity = function (activityType, settings, user) {
    return {
        type: activityType,
        locale: settings.locale,
        value: {
            trigger: settings.trigger,
        },
        from: user,
        name: 'TriggerScenario',
    };
};
var ChatBotModel = /** @class */ (function () {
    function ChatBotModel(settings, bindings) {
        var _this = this;
        this.token = null;
        this.bot = null;
        this.connection = null;
        this.settings = null;
        this.sessionTokenCallback = function (context, sessionToken, bindings) {
            var user = BuildUser(sessionToken.payload.userId);
            var connectionSettings = BuildBotConnection(sessionToken.payload.connectorToken, context.settings);
            context.connection = new BotChat.DirectLine(connectionSettings);
            var appSettings = BuildBotChatAppSettings(context.connection, user, context.settings);
            context.bot = BotChat.App(appSettings, document.getElementById('botContainer'));
            var activity = BuildActivity('invoke', context.settings, user);
            context.connection.postActivity(activity).subscribe(function (id) {
                console.log(JSON.stringify(id));
            });
            bindings(context);
        };
        this.settings = settings;
        this.token = new SessionToken(function (x) { return _this.sessionTokenCallback(_this, x, bindings); });
    }
    return ChatBotModel;
}());
//# sourceMappingURL=chat-bot-service.js.map