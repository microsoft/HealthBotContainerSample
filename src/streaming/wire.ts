import type { StreamEnvelope } from "../reducer/models";

export const POST_ACTIVITY = "DIRECT_LINE/POST_ACTIVITY";
export const INCOMING_ACTIVITY = "DIRECT_LINE/INCOMING_ACTIVITY";
export const QUEUE_INCOMING_ACTIVITY = "DIRECT_LINE/QUEUE_INCOMING_ACTIVITY";
export const MESSAGE = "message";

export const SET_DICTATE_INTERIMS = "WEB_CHAT/SET_DICTATE_INTERIMS";
export const SET_DICTATE_STATE = "WEB_CHAT/SET_DICTATE_STATE";
export const START_DICTATE = "WEB_CHAT/START_DICTATE";
export const STOP_DICTATE = "WEB_CHAT/STOP_DICTATE";
export const SET_SEND_BOX = "WEB_CHAT/SET_SEND_BOX";
export const SUBMIT_SEND_BOX = "WEB_CHAT/SUBMIT_SEND_BOX";
export const START_SPEAKING = "WEB_CHAT/START_SPEAKING";
export const DICTATION_ERROR = "HAS/DICTATION_ERROR";

export const DictateState = {
  IDLE: 0,
  WILL_START: 1,
  STARTING: 2,
  DICTATING: 3,
  STOPPING: 4,
} as const;

export const DEFAULT_PROGRESS_ID = "has-stream-progress-0";
export const STREAM_ACTIVITY_ID_PREFIX = "has-stream-progress-";

export interface WebChatStore {
  dispatch: (action: unknown) => unknown;
  getState?: () => unknown;
}

export interface ActivityFrom {
  role?: string;
  id?: string;
  name?: string;
}

export interface Activity {
  id?: string;
  type?: string;
  name?: string;
  text?: string;
  from?: ActivityFrom;
  timestamp?: string;
  channelData?: Record<string, unknown>;
  value?: { stream?: StreamEnvelope };
  [key: string]: unknown;
}

export interface WebChatActivity {
  type?: string;
  name?: string;
  locale?: string;
  from?: { role?: string };
  value?: unknown;
  [key: string]: unknown;
}

export interface WebChatAction {
  type: string;
  meta?: unknown;
  payload?: {
    activity?: WebChatActivity;
    dictateInterims?: readonly string[];
    dictateState?: number;
    text?: string;
    [key: string]: unknown;
  };
}
