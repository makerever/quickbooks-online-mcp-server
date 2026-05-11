import type { Request, Response, NextFunction } from "express";

/**
 * Per-request QuickBooks credentials parsed from the Authorization header.
 *
 * The bearer is a pipe-separated triple supplied by the caller (your Django
 * connector hub, n8n configured by Django, your own backend — anything that
 * already has a valid QBO access token + realmId):
 *
 *     Authorization: Bearer <qbo-access-token>|<realmId>[|<environment>]
 *
 * `environment` is optional and defaults to "production". Intuit's JWE
 * tokens do not contain '|', so the separator is safe. Whitespace around
 * each segment is tolerated.
 */
export interface QboCreds {
  accessToken: string;
  realmId: string;
  environment: "sandbox" | "production";
}

declare module "express-serve-static-core" {
  interface Request {
    qboCreds?: QboCreds;
  }
}

const ENV_VALUES = new Set(["sandbox", "production"]);

function parseBearer(headerValue: string): QboCreds | { error: string } {
  if (!headerValue.startsWith("Bearer ")) {
    return {
      error:
        "Authorization header must be: Bearer <qbo-access-token>|<realmId>[|<environment>].",
    };
  }
  const raw = headerValue.slice("Bearer ".length).trim();
  if (raw.length === 0) {
    return { error: "Authorization bearer value is empty." };
  }
  const parts = raw.split("|").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) {
    return {
      error:
        "Bearer must be `<accessToken>|<realmId>` or `<accessToken>|<realmId>|<environment>`.",
    };
  }
  const [accessToken, realmId, env] = parts;
  if (!accessToken) return { error: "accessToken segment is empty." };
  if (!realmId) return { error: "realmId segment is empty." };

  let environment: "sandbox" | "production" = "production";
  if (env !== undefined && env !== "") {
    if (!ENV_VALUES.has(env)) {
      return {
        error: `environment must be "sandbox" or "production". Got: ${env}`,
      };
    }
    environment = env as "sandbox" | "production";
  }

  return { accessToken, realmId, environment };
}

/**
 * Express middleware: rejects any /mcp request that doesn't carry a valid
 * composite bearer. On success, attaches the parsed creds to req.qboCreds
 * for the route handler to forward into AsyncLocalStorage.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || typeof header !== "string") {
    res.status(401).json({
      error: "unauthenticated",
      message:
        "Authorization header required: Bearer <qbo-access-token>|<realmId>[|<environment>].",
    });
    return;
  }
  const parsed = parseBearer(header);
  if ("error" in parsed) {
    res.status(401).json({ error: "unauthenticated", message: parsed.error });
    return;
  }
  req.qboCreds = parsed;
  next();
}
