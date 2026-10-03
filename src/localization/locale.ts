// Preserve scripts and Unicode extensions without relying on Intl.Locale in Hermes.
export function localeWithRegion(tag: string, region?: string | null): string {
  if (!region) return tag;
  const parts = tag.split("-");
  const extension = parts.findIndex((part, index) => index > 0 && part.length === 1);
  const base = extension < 0 ? parts : parts.slice(0, extension);
  const extras = extension < 0 ? [] : parts.slice(extension);
  const existing = base.findIndex((part, index) => index > 0 && /^(?:[A-Za-z]{2}|[0-9]{3})$/.test(part));
  if (existing < 0) base.push(region);
  else base[existing] = region;
  return [...base, ...extras].join("-");
}
