import { useEffect, useState } from 'react';
import { getUserLocation } from './geolocation';
import type { GeoLocation, TokenPayload } from '../types';

const DEFAULT_LOCALE = 'en-US';

function extractLocale(localeParam: string | null): string {
  if (!localeParam) {
    return DEFAULT_LOCALE;
  }
  if (localeParam === 'autodetect') {
    return navigator.language;
  }
  return localeParam;
}

export interface TokenState {
  status: 'loading' | 'ready' | 'error';
  tokenPayload?: TokenPayload;
  jsonWebToken?: string;
  error?: string;
}

// Identity supplied by the page itself (e.g. the agent login form). It takes precedence over
// the userId/userName query parameters.
export interface TokenRequest {
  userId?: string;
  userName?: string;
  agent?: boolean;
}

// POST /chatBot and return the raw signed JWT. Supported query parameters: locale
// (with `autodetect`), optional userId/userName, and an optional shared location.
async function requestToken(info: TokenRequest, location?: GeoLocation): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  let path = '/chatBot?locale=' + encodeURIComponent(extractLocale(params.get('locale')));

  if (location) {
    path += '&lat=' + location.lat + '&long=' + location.long;
  }
  const userId = info.userId || params.get('userId');
  if (userId) {
    path += '&userId=' + encodeURIComponent(userId);
  }
  const userName = info.userName || params.get('userName');
  if (userName) {
    path += '&userName=' + encodeURIComponent(userName);
  }
  if (info.agent) {
    path += '&agent=true';
  }

  const response = await fetch(path, { method: 'POST' });
  if (response.status >= 400) {
    throw new Error(response.statusText || 'Failed to start conversation');
  }
  return response.text();
}

// The JWT payload is base64url in the middle segment; decode it to read the user and
// Direct Line connection details the backend embedded.
function decodeTokenPayload(jsonWebToken: string): TokenPayload {
  const base64 = jsonWebToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as TokenPayload;
}

// Acquire the Direct Line token once `enabled` (on mount by default). When `?shareLocation`
// is present we resolve the user's location first so the backend can attach it to the
// conversation.
export function useDirectLineToken(
  { userId, userName, agent }: TokenRequest = {},
  enabled = true,
): TokenState {
  const [state, setState] = useState<TokenState>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let cancelled = false;

    const start = (location?: GeoLocation) => {
      requestToken({ userId, userName, agent }, location)
        .then((jsonWebToken) => {
          if (cancelled) {
            return;
          }
          setState({
            status: 'ready',
            jsonWebToken,
            tokenPayload: decodeTokenPayload(jsonWebToken),
          });
        })
        .catch((error: Error) => {
          if (cancelled) {
            return;
          }
          setState({ status: 'error', error: error.message });
        });
    };

    const params = new URLSearchParams(window.location.search);
    if (params.has('shareLocation')) {
      getUserLocation((location) => start(location));
    } else {
      start();
    }

    return () => {
      cancelled = true;
    };
  }, [enabled, userId, userName, agent]);

  return state;
}
