import type { PersistenceAdapter } from "./types";

export class MemoryPersistenceAdapter implements PersistenceAdapter {
  private snapshot: string | null;
  readonly quarantinedSnapshots: string[] = [];

  constructor(initialSnapshot: string | null = null) {
    this.snapshot = initialSnapshot;
  }

  async readSnapshot(): Promise<string | null> {
    return this.snapshot;
  }

  async writeSnapshot(snapshot: string): Promise<void> {
    this.snapshot = snapshot;
  }

  async quarantineSnapshot(snapshot: string): Promise<void> {
    this.quarantinedSnapshots.push(snapshot);
  }

  async reset(): Promise<void> {
    this.snapshot = null;
  }
}

