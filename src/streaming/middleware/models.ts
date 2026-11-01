import type { ReactNode } from "react";
import type { MessageState } from "../../reducer/models";
import type { StreamController } from "../controller/models";
import type { LocaleController } from "../locale/locale";
import type { GeoLocation } from "../../types";

export const DEBOUNCE_DELAY_MS = 500;

export interface StreamingMiddlewareOptions {
  streaming: StreamController;
  locale: LocaleController;
}

export interface CreateChatStoreOptions {
  streaming: StreamController;
  locale: LocaleController;
  /** Signed token that authenticates this conversation to the bot. */
  jsonWebToken: string;
  /** Resolves the browser location for the bot's ShareLocation request. */
  requestLocation: (callback: (location?: GeoLocation) => void) => void;
  devTools?: boolean;
}

export type LegacyRenderFunction = (
  renderAttachment: unknown,
  options: unknown
) => ReactNode;

export type RenderResult = LegacyRenderFunction | false;

export type NextFn = (...args: unknown[]) => RenderResult;

export interface ActivityCard {
  activity?: {
    id?: string;
    attachments?: { contentType?: string; content?: unknown }[];
    channelData?: {
      hasStreamReveal?: boolean;
      hasStreamExpired?: boolean;
      state?: MessageState;
    };
  };
}
