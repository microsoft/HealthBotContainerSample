import { useMemo } from 'react';
import ReactWebChat, { createDirectLine } from 'botframework-webchat';
import { createController } from '../streaming';
import { createChatStore } from './createChatStore';
import { activityMiddleware } from './activityMiddleware';
import { getUserLocation } from './geolocation';
import type { TokenPayload, User } from '../types';

interface ChatProps {
  tokenPayload: TokenPayload;
  jsonWebToken: string;
}

// Web Chat is customizable without forking the source: appearance is driven entirely
// through styleOptions. Ported verbatim from the original public/index.js.
const styleOptions = {
  botAvatarImage:
    'https://docs.microsoft.com/en-us/azure/bot-service/v4sdk/media/logo_bot.svg?view=azure-bot-service-4.0',
  // botAvatarInitials: '',
  // userAvatarImage: '',
  hideSendBox: false /* set to true to hide the send box from the view */,
  botAvatarInitials: 'Bot',
  userAvatarInitials: 'You',
  backgroundColor: '#F8F8F8',
};

export default function Chat({ tokenPayload, jsonWebToken }: ChatProps) {
  // Direct Line connection and the Redux store are created once per conversation.
  const { directLine, store } = useMemo(() => {
    const user: User = {
      id: tokenPayload.userId,
      name: tokenPayload.userName,
      locale: tokenPayload.locale,
    };

    const domain = tokenPayload.directLineURI
      ? 'https://' + tokenPayload.directLineURI + '/v3/directline'
      : undefined;

    const nextDirectLine = createDirectLine({
      token: tokenPayload.connectorToken,
      domain,
    });

    const streaming = createController();
    const nextStore = createChatStore({
      streaming,
      user,
      jsonWebToken,
      requestLocation: getUserLocation,
      devTools: import.meta.env.DEV,
    });

    return { directLine: nextDirectLine, store: nextStore };
  }, [tokenPayload, jsonWebToken]);

  return (
    <ReactWebChat
      directLine={directLine}
      store={store}
      styleOptions={styleOptions}
      activityMiddleware={activityMiddleware as never}
      userID={tokenPayload.userId}
      username={tokenPayload.userName}
      locale={tokenPayload.locale}
    />
  );
}
