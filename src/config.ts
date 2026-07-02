import type { AircraftStats, JetConfig, LevelConfig, SaveState } from "./types";

export const GAME = {
  playerBaseHealth: 200,
  enemyBaseHealth: 150,
  wingDamage: 7,
  bodyDamage: 13,
  killCoins: 125,
  hitCoins: 5,
  victoryPointUpgrade: 0.15,
  jetUpgradeMultiplier: 0.25,
  bulletSpeed: 235,
  bulletLifetime: 2.2,
  cameraDistance: 24,
  cameraHeight: 7,
  playerAcceleration: 15,
  basePlayerSpeed: 74,
  baseEnemySpeed: 58,
  enemyDetectionRange: 260,
  enemyFireRange: 160,
  citySize: 760
} as const;

export const LEVELS: LevelConfig[] = [
  { level: 1, enemyCount: 5 },
  { level: 2, enemyCount: 10 },
  { level: 3, enemyCount: 15 }
];

export const JETS: JetConfig[] = [
  {
    id: "rustwing",
    name: "Rustwing Mk I",
    price: 0,
    tier: 0,
    description: "Weathered WWII fighter with exposed rivets and steady guns.",
    statMultiplier: 1
  },
  {
    id: "comet",
    name: "Comet Interceptor",
    price: 2500,
    tier: 1,
    description: "Early jet-age frame with swept wings and stronger systems.",
    statMultiplier: 1.25
  },
  {
    id: "raptor",
    name: "Raptor Ghost",
    price: 2500,
    tier: 2,
    description: "Angular modern strike fighter with tight response.",
    statMultiplier: 1.5
  },
  {
    id: "shade",
    name: "Shade Vector",
    price: 2500,
    tier: 3,
    description: "Low-observable stealth craft with high-output weapons.",
    statMultiplier: 1.75
  }
];

export const DEFAULT_SAVE: SaveState = {
  coins: 0,
  victoryPoints: 0,
  highestUnlockedLevel: 1,
  activeJetId: "rustwing",
  unlockedJetIds: ["rustwing"],
  upgrades: {
    speed: 0,
    fireRate: 0,
    health: 0
  }
};

export const BASE_PLAYER_STATS: AircraftStats = {
  maxHealth: GAME.playerBaseHealth,
  maxSpeed: GAME.basePlayerSpeed,
  acceleration: GAME.playerAcceleration,
  turnRate: 2.8,
  fireRate: 7.5
};

export const BASE_ENEMY_STATS: AircraftStats = {
  maxHealth: GAME.enemyBaseHealth,
  maxSpeed: GAME.baseEnemySpeed,
  acceleration: 11,
  turnRate: 1.55,
  fireRate: 2.7
};
