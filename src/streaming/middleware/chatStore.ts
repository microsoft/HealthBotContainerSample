import { createStore, createStoreWithDevTools } from "botframework-webchat";
import { createConnectionMiddleware } from "./connectionMiddleware";
import { createStreamingMiddleware } from "./streamingMiddleware";
import { createDictationMiddleware } from "./dictationMiddleware";
import type { CreateChatStoreOptions } from "./models";

export function createChatStore({
  streaming,
  locale,
  jsonWebToken,
  requestLocation,
  devTools,
}: CreateChatStoreOptions) {
  // Connection runs first so it can authenticate on connect and answer ShareLocation before
  // the streaming middleware inspects frames; dictation sits last for mic/TTS actions.
  const connection = createConnectionMiddleware({
    jsonWebToken,
    locale,
    requestLocation,
  });
  const streamingMiddleware = createStreamingMiddleware({ streaming, locale });
  const createStoreFn = devTools ? createStoreWithDevTools : createStore;
  return createStoreFn(
    {},
    connection as never,
    streamingMiddleware as never,
    createDictationMiddleware() as never
  );
}
