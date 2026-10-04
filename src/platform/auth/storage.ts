import { credentialNamespace } from "./config";
export const credentialStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof document === "undefined") return null;
    const name = encodeURIComponent(`${credentialNamespace}.${key}`);
    const value = document.cookie.split("; ").find(item => item.startsWith(`${name}=`));
    return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (location.protocol !== "https:" && !loopback) throw new Error("Secure storage unavailable");
    document.cookie = `${encodeURIComponent(`${credentialNamespace}.${key}`)}=${encodeURIComponent(value)}; Path=/; SameSite=Strict; Max-Age=2592000${location.protocol === "https:" ? "; Secure" : ""}`;
    if (await this.getItem(key) !== value) throw new Error("Storage unavailable");
  },
  async removeItem(key: string): Promise<void> {
    document.cookie = `${encodeURIComponent(`${credentialNamespace}.${key}`)}=; Path=/; SameSite=Strict; Max-Age=0${location.protocol === "https:" ? "; Secure" : ""}`;
  },
  async clear(): Promise<void> {
    for (const item of document.cookie.split("; ")) {
      const name = decodeURIComponent(item.split("=")[0] ?? "");
      if (name.startsWith(`${credentialNamespace}.`)) await this.removeItem(name.slice(credentialNamespace.length + 1));
    }
  },
};
