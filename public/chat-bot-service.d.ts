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
declare class SessionToken {
    value: string;
    head: ISessionTokenHead;
    payload: ISessionTokenPayload;
    hash: string;
    constructorCallback: (e: SessionToken) => void;
    constructor(callback?: (e: any) => any);
    response(context: SessionToken, response: any): void;
    parse(value: string): any;
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
declare const BuildUser: (id: string) => {
    id: string;
    name: string;
    role: string;
};
declare const BuildBotConnection: (connectorToken: string, settings: IBotSettings) => {
    token: string;
    domain: string;
    webSocket: boolean;
};
declare const BuildBotChatAppSettings: (connection: any, user: any, settings: IBotSettings) => {
    botConnection: any;
    user: any;
    locale: string;
    resize: "none" | "window" | "detect";
    chatTitle: string | boolean;
    showUploadButton: boolean;
};
declare const BuildActivity: (activityType: string, settings: IBotSettings, user: any) => {
    type: string;
    locale: string;
    value: {
        trigger: string;
    };
    from: any;
    name: string;
};
declare class ChatBotModel {
    token: SessionToken;
    bot: any;
    connection: any;
    settings: IBotSettings;
    constructor(settings: IBotSettings, bindings: any);
    sessionTokenCallback: (context: ChatBotModel, sessionToken: SessionToken, bindings: any) => void;
}
