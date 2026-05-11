import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const QuickBooksCtor = jest.fn();
jest.unstable_mockModule('node-quickbooks', () => ({
  __esModule: true,
  default: QuickBooksCtor,
}));

const { quickbooksClient } = await import(
  '../../../src/clients/quickbooks-client'
);
const { sessionContext } = await import('../../../src/server/session-context');

const inRequest = <T>(
  sessionId: string,
  qboCreds: {
    accessToken: string;
    realmId: string;
    environment: 'sandbox' | 'production';
  },
  fn: () => T | Promise<T>,
): T | Promise<T> => sessionContext.run({ sessionId, qboCreds }, fn);

describe('quickbooksClient (per-request, creds from ALS)', () => {
  beforeEach(() => {
    QuickBooksCtor.mockClear();
    delete process.env.QBO_CLIENT_ID;
    delete process.env.QBO_CLIENT_SECRET;
  });

  it('throws when called outside any MCP session context', async () => {
    await expect(quickbooksClient.authenticate()).rejects.toThrow(
      /active MCP session context/,
    );
  });

  it('builds a node-quickbooks instance from the request creds', async () => {
    process.env.QBO_CLIENT_ID = 'app-id';
    process.env.QBO_CLIENT_SECRET = 'app-secret';
    await inRequest(
      's-1',
      { accessToken: 'tok-A', realmId: 'realm-A', environment: 'production' },
      async () => {
        await quickbooksClient.authenticate();
      },
    );
    expect(QuickBooksCtor).toHaveBeenCalledTimes(1);
    const args = QuickBooksCtor.mock.calls[0];
    expect(args[0]).toBe('app-id');
    expect(args[1]).toBe('app-secret');
    expect(args[2]).toBe('tok-A');
    expect(args[3]).toBe(false);
    expect(args[4]).toBe('realm-A');
    expect(args[5]).toBe(false); // production -> not sandbox
    expect(args[8]).toBe('2.0');
    expect(args[9]).toBeUndefined();
  });

  it('treats sandbox environment as useSandbox=true', async () => {
    await inRequest(
      's-1',
      { accessToken: 'tok', realmId: 'realm', environment: 'sandbox' },
      async () => {
        await quickbooksClient.authenticate();
      },
    );
    expect(QuickBooksCtor.mock.calls[0][5]).toBe(true);
  });

  it('uses empty-string app identity when env vars are unset', async () => {
    await inRequest(
      's-1',
      { accessToken: 'tok', realmId: 'realm', environment: 'production' },
      async () => {
        await quickbooksClient.authenticate();
      },
    );
    expect(QuickBooksCtor.mock.calls[0][0]).toBe('');
    expect(QuickBooksCtor.mock.calls[0][1]).toBe('');
  });

  it('reuses the same instance for the same in-flight request', async () => {
    await inRequest(
      's-1',
      { accessToken: 'tok', realmId: 'realm', environment: 'production' },
      async () => {
        await quickbooksClient.authenticate();
        await quickbooksClient.authenticate();
      },
    );
    expect(QuickBooksCtor).toHaveBeenCalledTimes(1);
  });

  it('builds a fresh instance per request, never sharing across requests', async () => {
    await inRequest(
      's-A',
      { accessToken: 'tok-A', realmId: 'realm-A', environment: 'production' },
      async () => {
        await quickbooksClient.authenticate();
      },
    );
    await inRequest(
      's-B',
      { accessToken: 'tok-B', realmId: 'realm-B', environment: 'sandbox' },
      async () => {
        await quickbooksClient.authenticate();
      },
    );
    expect(QuickBooksCtor).toHaveBeenCalledTimes(2);
    expect(QuickBooksCtor.mock.calls[0][2]).toBe('tok-A');
    expect(QuickBooksCtor.mock.calls[1][2]).toBe('tok-B');
  });

  describe('getQuickbooks', () => {
    it('throws when called outside any MCP session context', () => {
      expect(() => quickbooksClient.getQuickbooks()).toThrow(
        /active MCP session context/,
      );
    });

    it('throws when authenticate has not been called for the current request', () => {
      inRequest(
        's-1',
        { accessToken: 'tok', realmId: 'realm', environment: 'production' },
        () => {
          expect(() => quickbooksClient.getQuickbooks()).toThrow(/authenticate\(\)/);
        },
      );
    });

    it('returns the same instance authenticate() built', async () => {
      await inRequest(
        's-1',
        { accessToken: 'tok', realmId: 'realm', environment: 'production' },
        async () => {
          const built = await quickbooksClient.authenticate();
          expect(quickbooksClient.getQuickbooks()).toBe(built);
        },
      );
    });
  });
});
