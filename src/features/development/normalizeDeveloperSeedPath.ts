export function normalizeDeveloperSeedPath(path: string): string {
  try {
    const url = new URL(path);
    const route = url.hostname || url.pathname.replace(/^\/+/, "");
    if (route === "developer-seed") return `/developer-seed${url.search}`;
    if (route === "join") return "/join";
    return path;
  } catch {
    return path;
  }
}
