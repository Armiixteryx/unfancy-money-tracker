import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import RootHtml from "../../../app/+html";
import { webBrandForEnvironment } from "./webBrand";

vi.mock("expo-router/html", () => ({ ScrollViewStyleReset: () => <style id="expo-reset" /> }));

const manifestSchema = z.object({
  id: z.string(), name: z.string(), short_name: z.string(),
  start_url: z.literal("/"), scope: z.literal("/"), display: z.literal("standalone"),
  theme_color: z.literal("#102A43"), background_color: z.literal("#102A43"),
  icons: z.array(z.object({ src: z.string(), sizes: z.string(), type: z.literal("image/png"), purpose: z.enum(["any", "maskable"]) })),
});

function asset(path: string) { return readFileSync(resolve(process.cwd(), `public${path}`)); }

let tree: ReactTestRenderer | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  vi.unstubAllEnvs();
});

describe("browser brand handoff", () => {
  it.each([undefined, "local", "dev", "prod", "demo"])("keeps the HTML and all install assets in one environment for %s", async environment => {
    if (environment === undefined) vi.stubEnv("EXPO_PUBLIC_ENV", undefined);
    else vi.stubEnv("EXPO_PUBLIC_ENV", environment);
    const brand = webBrandForEnvironment(environment);
    await act(async () => { tree = create(<RootHtml><div id="root">Application</div></RootHtml>); });
    const root = tree!.root;
    // Expo Router Head owns the title; adding one in +html duplicates it on export.
    expect(root.findAllByType("title")).toHaveLength(0);
    expect(root.findAllByType("link").map(link => link.props)).toEqual(expect.arrayContaining([
      { rel: "manifest", href: brand.manifest },
      { rel: "apple-touch-icon", href: brand.appleTouchIcon },
      { rel: "icon", href: brand.favicon, type: "image/svg+xml" },
    ]));
    expect(root.findAllByType("meta").map(meta => meta.props)).toContainEqual({ name: "theme-color", content: "#102A43" });
    expect(root.findByProps({ id: "expo-reset" })).toBeDefined();
    expect(root.findByProps({ id: "root" }).children).toEqual(["Application"]);
    const manifest = manifestSchema.parse(JSON.parse(asset(brand.manifest).toString("utf8")) as unknown);
    expect(manifest.name).toBe(brand.name);
    expect(manifest.id).toBe(environment === "demo" ? "/unfancy-money-tracker-demo" : environment === "prod" ? "/unfancy-money-tracker" : "/unfancy-money-tracker-dev");
    const policies = root.findAllByType("meta").filter(meta => meta.props.httpEquiv === "Content-Security-Policy");
    expect(policies).toHaveLength(environment === "demo" ? 1 : 0);
    if (environment === "demo") expect(policies[0]?.props.content).toContain("connect-src 'none'");
    expect(manifest.icons.map(icon => [icon.sizes, icon.purpose])).toEqual([
      ["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"],
    ]);
    for (const icon of [...manifest.icons, { src: brand.appleTouchIcon, sizes: "180x180" }]) {
      const directory = brand.manifest.slice(0, brand.manifest.lastIndexOf("/"));
      const png = asset(icon.src.startsWith("/") ? icon.src : `${directory}/${icon.src}`);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
    const expectedSvg = environment === "prod"
      ? "artifacts/brand-kit/platform/web/favicon.svg"
      : "artifacts/brand-kit/platform/dev/favicon-dev.svg";
    expect(asset(brand.favicon).equals(readFileSync(expectedSvg))).toBe(true);
  });

  it("preserves the approved production PNGs and keeps DEV artwork distinct", () => {
    for (const name of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "maskable-512.png"]) {
      const production = asset(`/brand/production/${name}`);
      expect(production.equals(readFileSync(`artifacts/brand-kit/platform/web/${name}`))).toBe(true);
      expect(production.equals(asset(`/brand/development/${name}`))).toBe(false);
    }
  });
});
