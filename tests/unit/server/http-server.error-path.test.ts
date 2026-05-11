import { describe, it, expect, jest } from '@jest/globals';
import { runTransportRequest } from '../../../src/server/http-server';

const buildRes = () => {
  const res: any = {
    statusCode: 0,
    headersSent: false,
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

describe('runTransportRequest', () => {
  it('returns without writing anything when fn resolves', async () => {
    const res = buildRes();
    await runTransportRequest({} as any, res, async () => {});
    expect(res.statusCode).toBe(0);
    expect(res.body).toBeUndefined();
  });

  it('writes 500 with message when fn throws an Error and headers were not sent', async () => {
    const res = buildRes();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runTransportRequest({} as any, res, async () => {
        throw new Error('boom');
      });
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'internal_error', message: 'boom' });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('writes 500 with String(value) when fn throws a non-Error', async () => {
    const res = buildRes();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runTransportRequest({} as any, res, async () => {
        throw 'string-error';
      });
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        error: 'internal_error',
        message: 'string-error',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('does NOT write to res when fn throws but headers are already sent', async () => {
    const res = buildRes();
    res.headersSent = true;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runTransportRequest({} as any, res, async () => {
        throw new Error('mid-stream');
      });
      expect(res.statusCode).toBe(0);
      expect(res.body).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('mid-stream'));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
