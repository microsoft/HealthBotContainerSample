import { describe, expect, it, vi } from 'vitest';
import { createLimiter, readCookie, rejectCrossSite } from '../serverSecurity';

function fakeRes() {
  const res: any = { statusCode: 200 };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.send = vi.fn(() => res);
  return res;
}

describe('rejectCrossSite', () => {
  it('blocks browser requests from another site', () => {
    const res = fakeRes();
    const next = vi.fn();
    rejectCrossSite({ headers: { 'sec-fetch-site': 'cross-site' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([['same-origin'], ['same-site'], [undefined]])('allows %s', value => {
    const next = vi.fn();
    rejectCrossSite({ headers: value ? { 'sec-fetch-site': value } : {} }, fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('readCookie', () => {
  it('reads a named cookie among several', () => {
    expect(readCookie({ headers: { cookie: 'a=1; userid=abc%20d; b=2' } }, 'userid')).toBe('abc d');
  });

  it('returns undefined when missing or malformed', () => {
    expect(readCookie({ headers: {} }, 'userid')).toBeUndefined();
    expect(readCookie({ headers: { cookie: 'userid=%E0%A4%A' } }, 'userid')).toBeUndefined();
  });
});

describe('createLimiter', () => {
  it('returns 429 once the limit is exceeded', async () => {
    const limiter = createLimiter({ limit: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res: any = {
        headersSent: false,
        statusCode: 200,
        setHeader() {},
        getHeader() {},
        status(code: number) {
          statuses.push(code);
          return res;
        },
        send() {
          return res;
        },
      };
      await new Promise<void>(resolve => {
        const done = () => resolve();
        res.send = done;
        limiter({ ip: '1.2.3.4', headers: {}, app: { get: () => false } } as any, res, done);
      });
    }
    expect(statuses).toEqual([429]);
  });
});
