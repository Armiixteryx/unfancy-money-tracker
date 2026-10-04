import type { PersistenceAdapter } from "../persistence/types";
export async function detectIntroduction(marker: PersistenceAdapter, dataset: PersistenceAdapter): Promise<boolean> {
  if (await marker.readSnapshot() !== null) return true;
  // Unreadable existing storage belongs in financial recovery, never a fresh installation.
  let existing: boolean;
  try { existing = await dataset.readSnapshot() !== null || await dataset.readRecoverySnapshot() !== null; }
  catch { existing = true; }
  if (existing) await marker.writeSnapshot("completed");
  return existing;
}
