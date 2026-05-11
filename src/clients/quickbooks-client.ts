import dotenv from "dotenv";
import QuickBooks from "node-quickbooks";
import path from "path";
import { fileURLToPath } from "url";
import {
  getCurrentQboCreds,
  sessionContext,
  type SessionContext,
} from "../server/session-context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve .env relative to the installed module (../../.env from dist/clients/).
// Required when the MCP server is spawned by a host whose working directory
// is not the project root.
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

interface RequestHolder {
  instance?: QuickBooks;
}

const holders = new WeakMap<SessionContext, RequestHolder>();

/**
 * Per-request QuickBooks client.
 *
 * The auth middleware has already fetched the user's current QBO creds from
 * the Django connector hub and attached them to the request context. This
 * client just constructs a node-quickbooks instance from those creds and
 * caches it for the lifetime of the request.
 *
 * Tenant isolation: each request has its own context object. Org A's QBO
 * client and Org B's QBO client live in completely separate ALS scopes
 * and share no module-level state.
 */
class QuickbooksClient {
  async authenticate(): Promise<QuickBooks> {
    const creds = getCurrentQboCreds();
    const ctx = sessionContext.getStore() as SessionContext;
    let holder = holders.get(ctx);
    if (!holder) {
      holder = {};
      holders.set(ctx, holder);
    }
    if (holder.instance) return holder.instance;

    // App identity for the node-quickbooks constructor. Not used for token
    // acquisition — the connector hub already produced a valid QBO token.
    const appClientId = process.env.QBO_CLIENT_ID ?? "";
    const appClientSecret = process.env.QBO_CLIENT_SECRET ?? "";

    holder.instance = new QuickBooks(
      appClientId,
      appClientSecret,
      creds.accessToken,
      false, // no OAuth 1.0 token secret
      creds.realmId,
      creds.environment === "sandbox",
      false, // debug
      null, // minor version
      "2.0", // oauth version
      undefined, // refresh token — connector hub handles refresh, not us
    );
    return holder.instance;
  }

  getQuickbooks(): QuickBooks {
    const ctx = sessionContext.getStore() as SessionContext | undefined;
    if (!ctx) {
      throw new Error(
        "No active MCP session context. quickbooksClient must be used from a tool handler.",
      );
    }
    const holder = holders.get(ctx);
    if (!holder?.instance) {
      throw new Error(
        "QuickBooks client not initialized for this request. Call authenticate() first.",
      );
    }
    return holder.instance;
  }
}

export const quickbooksClient = new QuickbooksClient();
