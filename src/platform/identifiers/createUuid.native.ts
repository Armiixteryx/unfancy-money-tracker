import * as Crypto from "expo-crypto";

export function createUuid(): string {
  return Crypto.randomUUID();
}
