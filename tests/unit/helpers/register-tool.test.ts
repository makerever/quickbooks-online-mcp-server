import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { RegisterTool } from '../../../src/helpers/register-tool';
import type { ToolDefinition } from '../../../src/types/tool-definition';

const fakeServer = (): {
  tool: jest.Mock;
  captured: () => {
    name: string;
    description: string;
    schema: unknown;
    handler: any;
  };
} => {
  const captured = { value: null as any };
  const tool = jest.fn(
    (name: string, description: string, schema: unknown, handler: any) => {
      captured.value = { name, description, schema, handler };
    },
  ) as any;
  return {
    tool,
    captured: () => {
      if (!captured.value) throw new Error('no tool registered');
      return captured.value;
    },
  };
};

describe('RegisterTool', () => {
  it('forwards (name, description, schema, handler) to the SDK as-is', () => {
    const handler = jest.fn();
    const tool: ToolDefinition<z.ZodObject<{ x: z.ZodString }>> = {
      name: 'tiny',
      description: 'a tiny tool',
      schema: z.object({ x: z.string() }),
      handler: handler as any,
    };
    const server = fakeServer();
    RegisterTool(server as any, tool);
    expect(server.tool).toHaveBeenCalledTimes(1);
    const c = server.captured();
    expect(c.name).toBe('tiny');
    expect(c.description).toBe('a tiny tool');
    expect(c.schema).toEqual({ params: tool.schema });
    // The handler is forwarded WITHOUT wrapping. The HTTP transport sets
    // up the AsyncLocalStorage scope before invoking it.
    expect(c.handler).toBe(handler);
  });
});
