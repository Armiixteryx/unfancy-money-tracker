/** Static browser metadata follows the same production gate as native icons. */
export function webBrandForEnvironment(environment: string | undefined) {
  const production = environment === "prod";
  const demo = environment === "demo";
  const assetBase = `/brand/${production ? "production" : "development"}`;
  return {
    name: demo ? "Unfancy Money Tracker (Demo)" : production ? "Unfancy Money Tracker" : "Unfancy Money Tracker (Dev)",
    favicon: `${assetBase}/favicon.svg`,
    appleTouchIcon: `${assetBase}/apple-touch-icon.png`,
    manifest: demo ? "/brand/demo/site.webmanifest" : `${assetBase}/site.webmanifest`,
    themeColor: "#102A43",
  };
}
