import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import type { AddressInfo } from 'net';
import { createApp, startHttpServer } from '../../../src/server/http-server';

const acceptHeader = 'application/json, text/event-stream';
const bearer = 'Bearer test-token|test-realm|sandbox';

const initializeBody = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.1' },
  },
});

const bodyText = (res: { body: any; text: string }): string =>
  res.body && typeof res.body === 'object' && Object.keys(res.body).length > 0
    ? JSON.stringify(res.body)
    : res.text;

const initializeAndGetSessionId = async (
  app: ReturnType<typeof createApp>,
): Promise<string> => {
  const res = await request(app)
    .post('/mcp')
    .set('Authorization', bearer)
    .set('Accept', acceptHeader)
    .send(initializeBody(1));
  expect(res.status).toBe(200);
  const sid = res.headers['mcp-session-id'];
  expect(typeof sid).toBe('string');
  expect((sid as string).length).toBeGreaterThan(0);
  return sid as string;
};

describe('createApp', () => {
  let app: ReturnType<typeof createApp>;
  beforeAll(() => {
    app = createApp();
  });

  describe('GET /healthz', () => {
    it('returns 200 with status ok and no auth required', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('Auth gating on /mcp', () => {
    it('rejects POST /mcp without an Authorization header (tools never reachable)', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Accept', acceptHeader)
        .send(initializeBody(99));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthenticated');
    });

    it('rejects POST /mcp with a malformed bearer', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer no-realmid')
        .set('Accept', acceptHeader)
        .send(initializeBody(99));
      expect(res.status).toBe(401);
    });

    it('rejects GET /mcp without an Authorization header', async () => {
      const res = await request(app).get('/mcp').set('Accept', acceptHeader);
      expect(res.status).toBe(401);
    });

    it('rejects DELETE /mcp without an Authorization header', async () => {
      const res = await request(app).delete('/mcp');
      expect(res.status).toBe(401);
    });
  });

  describe('Authenticated session lifecycle', () => {
    it('creates a session on initialize and returns Mcp-Session-Id', async () => {
      const sid = await initializeAndGetSessionId(app);
      expect(sid).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('rejects a non-initialize POST without an Mcp-Session-Id', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', bearer)
        .set('Accept', acceptHeader)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('bad_request');
    });

    it('rejects a POST with an unknown Mcp-Session-Id', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', bearer)
        .set('Accept', acceptHeader)
        .set('Mcp-Session-Id', 'does-not-exist')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('session_not_found');
    });

    it('lists tools when authenticated and session id is supplied', async () => {
      const sid = await initializeAndGetSessionId(app);
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', bearer)
        .set('Accept', acceptHeader)
        .set('Mcp-Session-Id', sid)
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      expect(res.status).toBe(200);
      const text = bodyText(res);
      expect(text).toContain('get_customer');
      expect(text).toContain('get_balance_sheet');
    });

    it('two parallel sessions get distinct ids', async () => {
      const a = await initializeAndGetSessionId(app);
      const b = await initializeAndGetSessionId(app);
      expect(a).not.toBe(b);
    });
  });

  describe('GET /mcp', () => {
    it('400s without an Mcp-Session-Id', async () => {
      const res = await request(app)
        .get('/mcp')
        .set('Authorization', bearer)
        .set('Accept', acceptHeader);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('bad_request');
    });

    it('404s for an unknown Mcp-Session-Id', async () => {
      const res = await request(app)
        .get('/mcp')
        .set('Authorization', bearer)
        .set('Accept', acceptHeader)
        .set('Mcp-Session-Id', 'unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /mcp', () => {
    it('terminates a known session', async () => {
      const sid = await initializeAndGetSessionId(app);
      const del = await request(app)
        .delete('/mcp')
        .set('Authorization', bearer)
        .set('Mcp-Session-Id', sid);
      expect([200, 204]).toContain(del.status);

      const followup = await request(app)
        .post('/mcp')
        .set('Authorization', bearer)
        .set('Accept', acceptHeader)
        .set('Mcp-Session-Id', sid)
        .send({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} });
      expect(followup.status).toBe(404);
    });

    it('400s without an Mcp-Session-Id', async () => {
      const res = await request(app).delete('/mcp').set('Authorization', bearer);
      expect(res.status).toBe(400);
    });

    it('404s for an unknown Mcp-Session-Id', async () => {
      const res = await request(app)
        .delete('/mcp')
        .set('Authorization', bearer)
        .set('Mcp-Session-Id', 'unknown');
      expect(res.status).toBe(404);
    });
  });
});

describe('startHttpServer', () => {
  it('binds to the given port and serves /healthz', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const server = startHttpServer(0);
    try {
      await new Promise<void>((resolve) =>
        server.once('listening', () => resolve()),
      );
      const address = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${address.port}/healthz`);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logSpy.mockRestore();
    }
  });
});
