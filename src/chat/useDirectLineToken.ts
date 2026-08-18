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

// POST /chatBot and return the raw signed JWT. Query parameters mirror the original
// public/index.js: locale (with `autodetect`), optional userId/userName, and an
// optional shared location.
async function requestToken(location?: GeoLocation): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  let path = '/chatBot?locale=' + encodeURIComponent(extractLocale(params.get('locale')));

  if (location) {
    path += '&lat=' + location.lat + '&long=' + location.long;
  }
  if (params.has('userId')) {
    path += '&userId=' + encodeURIComponent(params.get('userId') as string);
  }
  if (params.has('userName')) {
    path += '&userName=' + encodeURIComponent(params.get('userName') as string);
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
  return JSON.parse(atob(jsonWebToken.split('.')[1])) as TokenPayload;
}

// Acquire the Direct Line token once on mount. When `?shareLocation` is present we
// resolve the location first (matching the original chatRequested() behavior) so the
// backend can attach it to the conversation.
export function useDirectLineToken(): TokenState {
  const [state, setState] = useState<TokenState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const start = (location?: GeoLocation) => {
      requestToken(location)
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
  }, []);

  return state;
}
