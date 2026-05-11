import { describe, it, expect } from '@jest/globals';
import {
  sessionContext,
  getCurrentSessionId,
  getCurrentQboCreds,
} from '../../../src/server/session-context';

const sampleCreds = {
  accessToken: 'tok-1',
  realmId: 'realm-1',
  environment: 'production' as const,
};

describe('session-context accessors', () => {
  it('return the active values when called inside a context', () => {
    sessionContext.run(
      { sessionId: 'sess-42', qboCreds: sampleCreds },
      () => {
        expect(getCurrentSessionId()).toBe('sess-42');
        expect(getCurrentQboCreds()).toEqual(sampleCreds);
      },
    );
  });

  it('throws from getCurrentSessionId when called outside any context', () => {
    expect(() => getCurrentSessionId()).toThrow(/active MCP session context/);
  });

  it('throws from getCurrentQboCreds when called outside any context', () => {
    expect(() => getCurrentQboCreds()).toThrow(/active MCP session context/);
  });
});
