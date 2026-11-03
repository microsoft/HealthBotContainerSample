// Bing serves a generic placeholder for hosts without a favicon, so one URL covers every source.
const BING_FAVICON_ENDPOINT = "https://services.bingapis.com/favicon";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function displayHost(host: string): string {
  return host.replace(/^www\./, "");
}

export function faviconUrl(url: string): string | undefined {
  const host = hostOf(url);
  return host
    ? `${BING_FAVICON_ENDPOINT}?url=${encodeURIComponent(host)}`
    : undefined;
}
