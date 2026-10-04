import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialStorage } from "./storage";
import { credentialNamespace } from "./config";
let cookies: string[] = [];
const jar = new Map<string,string>();
function setup(protocol: string, hostname: string) {
  cookies=[]; jar.clear();
  vi.stubGlobal("location", { protocol, hostname });
  vi.stubGlobal("document", { get cookie() { return [...jar].map(([name,value]) => `${name}=${value}`).join("; "); }, set cookie(value: string) { cookies.push(value); const [item] = value.split(";"); const [name,...parts] = item!.split("="); if (value.includes("Max-Age=0")) jar.delete(name!); else jar.set(name!,parts.join("=")); } });
}
afterEach(() => vi.unstubAllGlobals());
describe("host-only auth cookies", () => {
  it("uses secure strict cookies and isolates cleanup by pool/client", async () => {
    setup("https:", "synthetic.invalid"); jar.set("financial", "preserved");
    await credentialStorage.setItem("token", "synthetic");
    expect(cookies[0]).toContain("SameSite=Strict"); expect(cookies[0]).toContain("; Secure"); expect(cookies[0]).not.toMatch(/Domain=/i);
    expect(await credentialStorage.getItem("token")).toBe("synthetic");
    expect(cookies[0]).toContain(encodeURIComponent(credentialNamespace));
    await credentialStorage.clear(); expect(await credentialStorage.getItem("token")).toBeNull(); expect(jar.get("financial")).toBe("preserved");
  });
  it("permits HTTP only on loopback", async () => {
    setup("http:", "localhost"); await credentialStorage.setItem("token", "synthetic");
    setup("http:", "synthetic.invalid"); await expect(credentialStorage.setItem("token", "synthetic")).rejects.toThrow("Secure storage unavailable"); expect(cookies).toHaveLength(0);
  });
  it("reports blocked cookie storage", async () => {
    setup("https:", "synthetic.invalid"); vi.stubGlobal("document", { get cookie() { return ""; }, set cookie(_value: string) {} });
    await expect(credentialStorage.setItem("token", "synthetic")).rejects.toThrow("Storage unavailable");
  });
});
