import { useEffect, useMemo, useState } from 'react';
import ReactWebChat, {
  createDirectLine,
  createBrowserWebSpeechPonyfillFactory,
} from 'botframework-webchat';
import { FluentThemeProvider } from 'botframework-webchat-fluent-theme';
import { createController } from '../streaming/controller/streaming';
import { createChatStore } from '../streaming/middleware/chatStore';
import { reportRecognitionErrors } from '../streaming/middleware/dictationMiddleware';
import { activityMiddleware } from '../streaming/middleware/activityMiddleware';
import { createLocaleController } from '../streaming/locale/locale';
import { EXPIRED_TOKEN_STATUS } from '../components/Chat/chatOptions';
import { adaptiveCardsHostConfig, styleOptions } from '../theme/theme';
import { sendBoxMiddleware } from '../components/SendBox/sendBoxMiddleware';
import { getUserLocation } from './geolocation';
import type { TokenPayload } from '../types';

// A streaming bot shows its progress in the chat, so typing dots would only duplicate it.
const hideTypingIndicator = () => () => () => false;

interface ChatProps {
  tokenPayload: TokenPayload;
  jsonWebToken: string;
}

export default function Chat({ tokenPayload, jsonWebToken }: ChatProps) {
  const { directLine, store, conversation, locale, webSpeechPonyfillFactory, streaming } =
    useMemo(() => {
      const localeController = createLocaleController(
        tokenPayload.locale ?? 'en-US',
      );

      // The backend hands back a bare host; Direct Line needs the full endpoint.
      const domain = tokenPayload.directLineURI
        ? 'https://' + tokenPayload.directLineURI + '/v3/directline'
        : undefined;
      const nextConversation = { token: tokenPayload.connectorToken, domain };

      const nextDirectLine = createDirectLine(nextConversation);
      const streaming = createController();
      const nextStore = createChatStore({
        streaming,
        locale: localeController,
        jsonWebToken,
        requestLocation: getUserLocation,
        devTools: import.meta.env.DEV,
      });

      return {
        directLine: nextDirectLine,
        store: nextStore,
        conversation: nextConversation,
        streaming,
        locale: localeController,
        // MicrophoneButton renders only when the browser supports speech, so enabling the
        // ponyfill here degrades gracefully to a no-op on unsupported browsers.
        webSpeechPonyfillFactory: reportRecognitionErrors(
          createBrowserWebSpeechPonyfillFactory() as never,
          nextStore.dispatch,
        ),
      };
    }, [tokenPayload, jsonWebToken]);

  // The backend says upfront whether the bot streams, because its typing activity can arrive
  // before the first stream frame. Detecting a frame covers a bot streaming despite the flag.
  const [streams, setStreams] = useState(tokenPayload.streaming !== false);
  useEffect(() => {
    setStreams((current) => current || streaming.hasSeenStream());
    return streaming.onFirstStream(() => setStreams(true));
  }, [streaming]);

  useEffect(() => {
    const subscription = directLine.connectionStatus$.subscribe(
      (status: number) => {
        if (status === EXPIRED_TOKEN_STATUS) {
          directLine.reconnect(conversation as never);
        }
      },
    );
    return () => subscription.unsubscribe();
  }, [directLine, conversation]);

  // Direct Line holds a live polling/WebSocket connection. Close it when the component
  // unmounts or the connection is replaced (new token) so we don't leak sockets or leave a
  // second connection re-firing InitConversation.
  useEffect(() => () => directLine.end(), [directLine]);

  return (
    <FluentThemeProvider>
      <ReactWebChat
        directLine={directLine}
        store={store}
        styleOptions={styleOptions}
        adaptiveCardsHostConfig={adaptiveCardsHostConfig}
        activityMiddleware={activityMiddleware as never}
        sendBoxMiddleware={sendBoxMiddleware as never}
        {...(streams && {
          typingIndicatorMiddleware: hideTypingIndicator as never,
        })}
        userID={tokenPayload.userId}
        username={tokenPayload.userName}
        locale={locale.get()}
        webSpeechPonyfillFactory={webSpeechPonyfillFactory as never}
      />
    </FluentThemeProvider>
  );
}
