import { describe, expect, it } from "vitest";
import { clearPrivateStorage } from "../../../app/src/clear_record.js";
import { HISTORY_KEY } from "../../../app/src/history.js";
import { STREAK_KEY } from "../../../app/src/streak.js";

function memoryStorage(failKey?: string) {
  const values = new Map([[HISTORY_KEY, "history"], [STREAK_KEY, "streak"]]);
  return { values, storage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { if (key === failKey) throw new Error("blocked"); values.delete(key); },
  } };
}

describe("private record clearing", () => {
  it("succeeds only after both storage keys are absent", () => {
    const { values, storage } = memoryStorage();
    expect(clearPrivateStorage(storage)).toEqual({ kind: "cleared" });
    expect(values.size).toBe(0);
  });

  it("restores both persisted values if either removal fails", () => {
    const { values, storage } = memoryStorage(STREAK_KEY);
    expect(clearPrivateStorage(storage)).toEqual({ kind: "restored", history: "history", streak: "streak" });
    expect(values.get(HISTORY_KEY)).toBe("history");
    expect(values.get(STREAK_KEY)).toBe("streak");
  });

  it("does not claim success when a remove call silently leaves a key", () => {
    const { values, storage } = memoryStorage();
    const sticky = { ...storage, removeItem: (key: string) => { if (key !== STREAK_KEY) values.delete(key); } };
    expect(clearPrivateStorage(sticky)).toEqual({ kind: "restored", history: "history", streak: "streak" });
    expect(values.get(HISTORY_KEY)).toBe("history");
    expect(values.get(STREAK_KEY)).toBe("streak");
  });

  it("reports partial state when rollback cannot restore a removed key", () => {
    const { values, storage } = memoryStorage(STREAK_KEY);
    const broken = { ...storage, setItem: (key: string, value: string) => { if (key === HISTORY_KEY) throw new Error("rollback blocked"); values.set(key, value); } };
    expect(clearPrivateStorage(broken)).toEqual({ kind: "partial", history: null, streak: "streak" });
  });

  it("reports failed-unknown when rollback readback fails", () => {
    const { storage } = memoryStorage(STREAK_KEY); let reads = 0;
    const unreadable = { ...storage, getItem: (key: string) => { reads += 1; if (reads > 2) throw new Error("readback blocked"); return storage.getItem(key); } };
    expect(clearPrivateStorage(unreadable)).toEqual({ kind: "failed-unknown" });
  });
});
