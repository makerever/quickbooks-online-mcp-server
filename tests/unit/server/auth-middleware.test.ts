import { describe, it, expect, jest } from '@jest/globals';
import { authMiddleware } from '../../../src/server/auth-middleware';

const buildRes = () => {
  const res: any = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('authMiddleware', () => {
  it('rejects requests with no Authorization header', () => {
    const req: any = { headers: {} };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'unauthenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests with a non-string Authorization header', () => {
    const req: any = { headers: { authorization: ['Bearer foo|bar'] } };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer scheme', () => {
    const req: any = { headers: { authorization: 'Basic abc' } };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/Bearer/);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an empty bearer value', () => {
    const req: any = { headers: { authorization: 'Bearer    ' } };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/empty/);
  });

  it('rejects bearer without a realmId segment', () => {
    const req: any = { headers: { authorization: 'Bearer access-only' } };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/accessToken.*realmId/);
  });

  it('rejects bearer with too many segments', () => {
    const req: any = { headers: { authorization: 'Bearer a|b|c|extra' } };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
  });

  it('rejects when accessToken segment is empty', () => {
    const req: any = { headers: { authorization: 'Bearer |realm-1' } };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/accessToken segment/);
  });

  it('rejects when realmId segment is empty', () => {
    const req: any = { headers: { authorization: 'Bearer tok-1|' } };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/realmId segment/);
  });

  it('rejects an invalid environment value', () => {
    const req: any = {
      headers: { authorization: 'Bearer tok|realm|staging' },
    };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/sandbox.*production/);
  });

  it('accepts a 2-part bearer and defaults environment to production', () => {
    const req: any = { headers: { authorization: 'Bearer tok|realm' } };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.qboCreds).toEqual({
      accessToken: 'tok',
      realmId: 'realm',
      environment: 'production',
    });
  });

  it('accepts a 3-part bearer with sandbox env', () => {
    const req: any = {
      headers: { authorization: 'Bearer tok|realm|sandbox' },
    };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.qboCreds).toEqual({
      accessToken: 'tok',
      realmId: 'realm',
      environment: 'sandbox',
    });
  });

  it('accepts a 3-part bearer with explicit production env', () => {
    const req: any = {
      headers: { authorization: 'Bearer tok|realm|production' },
    };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.qboCreds?.environment).toBe('production');
  });

  it('treats an explicitly empty environment segment as production default', () => {
    const req: any = {
      headers: { authorization: 'Bearer tok|realm|' },
    };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.qboCreds?.environment).toBe('production');
  });

  it('trims whitespace around each segment', () => {
    const req: any = {
      headers: { authorization: 'Bearer   tok  |  realm  |  sandbox  ' },
    };
    const res = buildRes();
    const next = jest.fn();
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.qboCreds).toEqual({
      accessToken: 'tok',
      realmId: 'realm',
      environment: 'sandbox',
    });
  });
});
