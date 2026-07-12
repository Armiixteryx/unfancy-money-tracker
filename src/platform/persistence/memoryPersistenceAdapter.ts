import type { PersistenceAdapter } from "./types";

export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private snapshot: string | null;
  readonly quarantinedSnapshots: string[] = [];
  readonly migrationBackups: string[] = [];
  private recoverySnapshot: string | null = null;

  constructor(initialSnapshot: string | null = null) {
    this.snapshot = initialSnapshot;
  }

  async readSnapshot(): Promise<string | null> {
    return this.snapshot;
  }

  async readRecoverySnapshot(): Promise<string | null> {
    return this.recoverySnapshot;
  }

  async writeSnapshot(snapshot: string): Promise<void> {
    this.snapshot = snapshot;
  }

  async quarantineSnapshot(snapshot: string): Promise<void> {
    this.quarantinedSnapshots.push(snapshot);
    this.recoverySnapshot = snapshot;
  }

  async backupMigrationSnapshot(snapshot: string): Promise<void> {
    this.migrationBackups.push(snapshot);
  }

  async restoreRecoverySnapshot(): Promise<void> {
    if (this.recoverySnapshot === null) throw new Error("No preserved snapshot is available");
    this.snapshot = this.recoverySnapshot;
  }

  async reset(): Promise<void> {
    this.snapshot = null;
    this.recoverySnapshot = null;
  }
}
