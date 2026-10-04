import { describe, expect, it } from "vitest";
import { MemoryPersistenceAdapter } from "../persistence/memoryPersistenceAdapter";
import { detectIntroduction } from "./introduction";
describe("independent introduction choice", () => {
  it("does not create financial records for new installations", async () => {
    const marker = new MemoryPersistenceAdapter(); const data = new MemoryPersistenceAdapter();
    expect(await detectIntroduction(marker, data)).toBe(false);
    expect(await data.readSnapshot()).toBeNull();
    await marker.writeSnapshot("completed");
    expect(await detectIntroduction(marker, data)).toBe(true);
  });
  it.each(["snapshot", "recovery"])("recognizes existing %s and survives financial reset", async kind => {
    const marker = new MemoryPersistenceAdapter(); const data = new MemoryPersistenceAdapter();
    if (kind === "snapshot") await data.writeSnapshot("existing"); else await data.quarantineSnapshot("existing");
    expect(await detectIntroduction(marker, data)).toBe(true);
    await data.reset();
    expect(await detectIntroduction(marker, data)).toBe(true);
  });
  it("keeps unreadable data on the recovery path", async () => {
    const marker = new MemoryPersistenceAdapter(); const data = new MemoryPersistenceAdapter();
    data.readSnapshot = async () => { throw new Error("unreadable"); };
    expect(await detectIntroduction(marker, data)).toBe(true);
  });
  it("does not pretend a failed marker write succeeded", async () => {
    const marker = new MemoryPersistenceAdapter(); const data = new MemoryPersistenceAdapter();
    await data.writeSnapshot("existing"); marker.writeSnapshot = async () => { throw new Error("storage"); };
    await expect(detectIntroduction(marker, data)).rejects.toThrow("storage");
    expect(await data.readSnapshot()).toBe("existing");
  });
});
