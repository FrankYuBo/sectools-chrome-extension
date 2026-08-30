export interface ObservedRedirectEvent {
  url: string;
  redirectUrl: string;
  statusCode: number;
  requestMethod?: string;
}

export interface RedirectHop {
  url: string;
  status: number;
  method: 'HEAD' | 'GET';
  location?: string;
  note?: string;
}

export interface RedirectChain {
  hops: RedirectHop[];
  finalUrl: string;
  cycle: boolean;
}

export function buildRedirectChain(
  startUrl: string,
  events: ObservedRedirectEvent[],
): RedirectChain {
  const eventsByUrl = new Map<string, ObservedRedirectEvent[]>();
  for (const event of events) {
    const list = eventsByUrl.get(event.url);
    if (list) list.push(event);
    else eventsByUrl.set(event.url, [event]);
  }

  const hops: RedirectHop[] = [];
  const visited = new Set<string>([startUrl]);
  let currentUrl = startUrl;

  while (eventsByUrl.size > 0) {
    const list = eventsByUrl.get(currentUrl);
    const event = list?.shift();
    if (!event) break;

    const hop: RedirectHop = {
      url: currentUrl,
      status: event.statusCode,
      method: event.requestMethod === 'HEAD' ? 'HEAD' : 'GET',
      location: event.redirectUrl,
    };

    if (visited.has(event.redirectUrl)) {
      hop.note = '检测到跳转环，已安全终止';
      hops.push(hop);
      return { hops, finalUrl: event.redirectUrl, cycle: true };
    }

    visited.add(event.redirectUrl);
    hops.push(hop);
    currentUrl = event.redirectUrl;
  }

  return { hops, finalUrl: currentUrl, cycle: false };
}

export function extractJsOrMetaRedirect(html: string): string | null {
  if (!html) return null;

  const meta = html.match(
    /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]+content\s*=\s*["'][^"']*url=([^"'>\s]+)["']?/i,
  );
  if (meta?.[1]) return meta[1].trim();

  const js = html.match(
    /(?:location(?:\.href)?\s*=|location\.replace\s*\(\s*|window\.open\s*\(\s*)["']([^"']+)["']/i,
  );
  return js?.[1]?.trim() ?? null;
}
