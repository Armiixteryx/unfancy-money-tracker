import type { AuthSession } from "./types";
import { z } from "zod";
import type { BackendStage } from "../runtime/cloudConfig";

export interface AuthSessionStore {
  get(): Promise<AuthSession | null>;
  set(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

const authSessionSchema = z.object({
  provider: z.literal("cognito"),
  backendStage: z.enum(["dev", "prod"]),
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
  private readonly sessionKey: string;

  constructor(private readonly backendStage: BackendStage) {
    this.sessionKey = `unfancy.auth.session:${backendStage}`;
  }

  async get(): Promise<AuthSession | null> {
    try {
      const secureStore = await import("expo-secure-store");
      const raw = await secureStore.getItemAsync(this.sessionKey);
      if (!raw) return null;
      return parseSession(raw);
    } catch {
      if (typeof globalThis.localStorage === "undefined") return null;
      const raw = globalThis.localStorage.getItem(this.sessionKey);
      if (!raw) return null;
      return parseSession(raw);
    }
  }

  async set(session: AuthSession): Promise<void> {
    const raw = JSON.stringify(session);
    try {
      const secureStore = await import("expo-secure-store");
      await secureStore.setItemAsync(this.sessionKey, raw, { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
      return;
    } catch {
      if (typeof globalThis.localStorage !== "undefined") globalThis.localStorage.setItem(this.sessionKey, raw);
    }
  }

  async clear(): Promise<void> {
    try {
      const secureStore = await import("expo-secure-store");
      await secureStore.deleteItemAsync(this.sessionKey);
    } catch {
      if (typeof globalThis.localStorage !== "undefined") globalThis.localStorage.removeItem(this.sessionKey);
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
