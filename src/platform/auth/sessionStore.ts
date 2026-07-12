import type { AuthSession } from "./types";
import { z } from "zod";

export interface AuthSessionStore {
  get(): Promise<AuthSession | null>;
  set(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

const SESSION_KEY = "unfancy.auth.session";
const authSessionSchema = z.object({
  accountId: z.string().min(1),
  status: z.enum(["verified", "unverified"]),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable(),
  expiresAt: z.string().datetime().nullable()
});

export class MemoryAuthSessionStore implements AuthSessionStore {
  private value: AuthSession | null = null;
  async get(): Promise<AuthSession | null> { return this.value; }
  async set(session: AuthSession): Promise<void> { this.value = session; }
  async clear(): Promise<void> { this.value = null; }
}

export class RuntimeAuthSessionStore implements AuthSessionStore {
  async get(): Promise<AuthSession | null> {
    try {
      const secureStore = await import("expo-secure-store");
      const raw = await secureStore.getItemAsync(SESSION_KEY);
      if (!raw) return null;
      return parseSession(raw);
    } catch {
      if (typeof globalThis.localStorage === "undefined") return null;
      const raw = globalThis.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return parseSession(raw);
    }
  }

  async set(session: AuthSession): Promise<void> {
    const raw = JSON.stringify(session);
    try {
      const secureStore = await import("expo-secure-store");
      await secureStore.setItemAsync(SESSION_KEY, raw, { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
      return;
    } catch {
      if (typeof globalThis.localStorage !== "undefined") globalThis.localStorage.setItem(SESSION_KEY, raw);
    }
  }

  async clear(): Promise<void> {
    try {
      const secureStore = await import("expo-secure-store");
      await secureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      if (typeof globalThis.localStorage !== "undefined") globalThis.localStorage.removeItem(SESSION_KEY);
    }
  }
}

function parseSession(raw: string): AuthSession | null {
  try {
    const parsed = authSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
