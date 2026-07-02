import { DEFAULT_SAVE, JETS } from "./config";
import type { SaveState, UpgradeKind } from "./types";

const SAVE_KEY = "fighter-sim-save-v1";

export function loadSave(): SaveState {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return structuredClone(DEFAULT_SAVE);

  try {
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    const unlockedJetIds = Array.isArray(parsed.unlockedJetIds)
      ? parsed.unlockedJetIds.filter((id) => JETS.some((jet) => jet.id === id))
      : DEFAULT_SAVE.unlockedJetIds;

    return {
      coins: Number.isFinite(parsed.coins) ? Number(parsed.coins) : DEFAULT_SAVE.coins,
      victoryPoints: Number.isFinite(parsed.victoryPoints)
        ? Number(parsed.victoryPoints)
        : DEFAULT_SAVE.victoryPoints,
      highestUnlockedLevel: Number.isFinite(parsed.highestUnlockedLevel)
        ? Math.max(1, Number(parsed.highestUnlockedLevel))
        : DEFAULT_SAVE.highestUnlockedLevel,
      activeJetId:
        parsed.activeJetId && unlockedJetIds.includes(parsed.activeJetId)
          ? parsed.activeJetId
          : DEFAULT_SAVE.activeJetId,
      unlockedJetIds: unlockedJetIds.length > 0 ? unlockedJetIds : DEFAULT_SAVE.unlockedJetIds,
      upgrades: {
        speed: Number(parsed.upgrades?.speed ?? 0),
        fireRate: Number(parsed.upgrades?.fireRate ?? 0),
        health: Number(parsed.upgrades?.health ?? 0)
      }
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function storeSave(save: SaveState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function resetSave(): SaveState {
  const save = structuredClone(DEFAULT_SAVE);
  storeSave(save);
  return save;
}

export function spendVictoryPoint(save: SaveState, kind: UpgradeKind): boolean {
  if (save.victoryPoints <= 0) return false;
  save.victoryPoints -= 1;
  save.upgrades[kind] += 1;
  storeSave(save);
  return true;
}
