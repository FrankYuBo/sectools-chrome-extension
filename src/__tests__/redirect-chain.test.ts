import { describe, expect, it } from 'vitest';
import {
  buildRedirectChain,
  extractJsOrMetaRedirect,
  type ObservedRedirectEvent,
} from '../utils/redirect-chain';

describe('buildRedirectChain', () => {
  it('rebuilds every observed HTTP redirect edge', () => {
    const events: ObservedRedirectEvent[] = [
      { url: 'https://a.example/', redirectUrl: 'https://b.example/', statusCode: 302, requestMethod: 'GET' },
      { url: 'https://b.example/', redirectUrl: 'https://final.example/path', statusCode: 301, requestMethod: 'GET' },
    ];

    const chain = buildRedirectChain('https://a.example/', events);
    expect(chain.cycle).toBe(false);
    expect(chain.finalUrl).toBe('https://final.example/path');
    expect(chain.hops).toEqual([
      { url: 'https://a.example/', status: 302, method: 'GET', location: 'https://b.example/' },
      { url: 'https://b.example/', status: 301, method: 'GET', location: 'https://final.example/path' },
    ]);
  });

  it('terminates an A to B cycle safely', () => {
    const events: ObservedRedirectEvent[] = [
      { url: 'https://a.example/', redirectUrl: 'https://b.example/', statusCode: 302, requestMethod: 'GET' },
      { url: 'https://b.example/', redirectUrl: 'https://a.example/', statusCode: 302, requestMethod: 'GET' },
      { url: 'https://a.example/', redirectUrl: 'https://b.example/', statusCode: 302, requestMethod: 'GET' },
    ];

    const chain = buildRedirectChain('https://a.example/', events);
    expect(chain.cycle).toBe(true);
    expect(chain.finalUrl).toBe('https://a.example/');
    expect(chain.hops).toHaveLength(2);
    expect(chain.hops.at(-1)?.note).toContain('跳转环');
  });

  it('returns the start URL when no redirect event is observed', () => {
    const chain = buildRedirectChain('https://a.example/', []);
    expect(chain).toEqual({ hops: [], finalUrl: 'https://a.example/', cycle: false });
  });
});

describe('extractJsOrMetaRedirect', () => {
  it('extracts a meta refresh target', () => {
    expect(
      extractJsOrMetaRedirect('<meta http-equiv="refresh" content="0;url=https://final.example">'),
    ).toBe('https://final.example');
  });

  it('extracts JavaScript redirect targets', () => {
    expect(extractJsOrMetaRedirect("<script>location.href='/next'</script>")).toBe('/next');
    expect(extractJsOrMetaRedirect("<script>location.replace('/replace')</script>")).toBe('/replace');
  });

  it('returns null for ordinary HTML', () => {
    expect(extractJsOrMetaRedirect('<html><body>safe</body></html>')).toBeNull();
  });
});
