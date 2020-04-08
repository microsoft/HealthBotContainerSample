declare var BotChat: any;

interface ISessionTokenHead {
  alg: string;
  typ: string;
}

interface ISessionTokenPayload {
  userId: string;
  connectorToken: string;
  optionalAttributes: any;
  iat: number;
}

class SessionToken {
  value: string = '';
  head: ISessionTokenHead = null;
  payload: ISessionTokenPayload = null;
  hash: string = '';
  constructorCallback: (e: SessionToken) => void = null;

  constructor(callback?: (e: any) => any) {
    this.constructorCallback = callback;

    const request = new XMLHttpRequest();

    request.addEventListener('load', (x) => this.response(this, x));

    request.open('POST', '/chatBot');

    request.send();
  }

  response(context: SessionToken, response: any) {
    context.value = response.target.responseText;

    if (!context.value) {
      return;
    }

    const segments = context.value.split('.');

    context.head = this.parse(segments[0]);

    context.payload = this.parse(segments[1]);

    context.hash = segments[2];

    context.constructorCallback(context);
  }

  parse(value: string) {
    const decodedValue = atob(value);

    const result = JSON.parse(decodedValue);

    return result;
  }
}

interface IBotSettings {
  webSocket: boolean;
  resize: 'none' | 'window' | 'detect';
  chatTitle: boolean | string;
  showUploadButton: boolean;
  container: HTMLElement;
  domain: string;
  locale: string;
  trigger: string;
}

const BuildUser = (id: string) => {
  return {
    id: id,
    name: 'you',
    role: 'user',
  };
};

const BuildBotConnection = (connectorToken: string, settings: IBotSettings) => {
  return {
    token: connectorToken,
    domain: settings.domain,
    webSocket: settings.webSocket,
  };
};

const BuildBotChatAppSettings = (connection: any, user: any, settings: IBotSettings) => {
  return {
    botConnection: connection,
    user: user,
    locale: settings.locale,
    resize: settings.resize,
    chatTitle: settings.chatTitle,
    showUploadButton: settings.showUploadButton,
  };
};

const BuildActivity = (activityType: string, settings: IBotSettings, user: any) => {
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

class ChatBotModel {
  token: SessionToken = null;
  bot: any = null;
  connection: any = null;
  settings: IBotSettings = null;

  constructor(settings: IBotSettings, bindings: any) {
    this.settings = settings;

    this.token = new SessionToken((x) => this.sessionTokenCallback(this, x, bindings));
  }

  sessionTokenCallback = (context: ChatBotModel, sessionToken: SessionToken, bindings: any) => {
    const user = BuildUser(sessionToken.payload.userId);

    const connectionSettings = BuildBotConnection(sessionToken.payload.connectorToken, context.settings);

    context.connection = new BotChat.DirectLine(connectionSettings);

    const appSettings = BuildBotChatAppSettings(context.connection, user, context.settings);

    context.bot = BotChat.App(appSettings, document.getElementById('botContainer'));

    const activity = BuildActivity('invoke', context.settings, user);

    context.connection.postActivity(activity).subscribe(function (id: any) {
      console.log(JSON.stringify(id));
    });

    bindings(context);
  };
}
