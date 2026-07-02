import { BASE_PLAYER_STATS, GAME, JETS } from "./config";
import type { AircraftStats, SaveState } from "./types";

export function getJet(id: string) {
  return JETS.find((jet) => jet.id === id) ?? JETS[0];
}

export function getPlayerStats(save: SaveState): AircraftStats {
  const jet = getJet(save.activeJetId);
  return {
    maxHealth: Math.round(
      BASE_PLAYER_STATS.maxHealth *
        jet.statMultiplier *
        (1 + save.upgrades.health * GAME.victoryPointUpgrade)
    ),
    maxSpeed:
      BASE_PLAYER_STATS.maxSpeed *
      jet.statMultiplier *
      (1 + save.upgrades.speed * GAME.victoryPointUpgrade),
    acceleration: BASE_PLAYER_STATS.acceleration,
    turnRate: BASE_PLAYER_STATS.turnRate,
    fireRate:
      BASE_PLAYER_STATS.fireRate *
      jet.statMultiplier *
      (1 + save.upgrades.fireRate * GAME.victoryPointUpgrade)
  };
}

export function buyJet(save: SaveState, jetId: string): boolean {
  const jet = getJet(jetId);
  if (save.unlockedJetIds.includes(jet.id)) {
    save.activeJetId = jet.id;
    return true;
  }

  if (jet.price <= 0 || save.coins < jet.price) return false;
  save.coins -= jet.price;
  save.unlockedJetIds.push(jet.id);
  save.activeJetId = jet.id;
  return true;
}
