import { createMockDataset } from "../development/mockData";
import { createUuid } from "../../platform/identifiers/createUuid";
import { MemoryPersistenceAdapter } from "../../platform/persistence/memoryPersistenceAdapter";

function sampleSnapshot(): string {
  const dataset = createMockDataset("dashboard", createUuid());
  return JSON.stringify({
    ...dataset,
    transactions: dataset.transactions.filter(transaction => transaction.currency === "USD"),
    preferences: { ...dataset.preferences, firstRunNoticeDismissed: true },
  });
}

class DemoPersistenceAdapter extends MemoryPersistenceAdapter {
  constructor(private readonly namespace: string) {
    super(namespace === "anonymous" ? sampleSnapshot() : null);
  }

  override async reset(): Promise<void> {
    await super.reset();
    if (this.namespace === "anonymous") await this.writeSnapshot(sampleSnapshot());
  }
}

// All callers in the current page share a namespace; a reload starts a fresh demo.
const adapters = new Map<string, DemoPersistenceAdapter>();
export function demoPersistenceAdapter(namespace: string): MemoryPersistenceAdapter {
  let adapter = adapters.get(namespace);
  if (!adapter) {
    adapter = new DemoPersistenceAdapter(namespace);
    adapters.set(namespace, adapter);
  }
  return adapter;
}
