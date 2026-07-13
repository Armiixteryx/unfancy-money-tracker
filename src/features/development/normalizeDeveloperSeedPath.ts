export function normalizeDeveloperSeedPath(path: string): string {
  try {
    const url = new URL(path);
    const route = url.hostname || url.pathname.replace(/^\/+/, "");
    return route === "developer-seed" ? `/developer-seed${url.search}` : path;
  } catch {
    return path;
  }
}
