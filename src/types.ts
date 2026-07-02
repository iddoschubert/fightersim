import * as THREE from "three";

export type UpgradeKind = "speed" | "fireRate" | "health";
export type HitZone = "wing" | "body";
export type AircraftTeam = "player" | "enemy";

export interface AircraftStats {
  maxHealth: number;
  maxSpeed: number;
  acceleration: number;
  turnRate: number;
  fireRate: number;
}

export interface JetConfig {
  id: string;
  name: string;
  price: number;
  tier: number;
  description: string;
  statMultiplier: number;
}

export interface LevelConfig {
  level: number;
  enemyCount: number;
}

export interface UpgradeState {
  speed: number;
  fireRate: number;
  health: number;
}

export interface SaveState {
  coins: number;
  victoryPoints: number;
  highestUnlockedLevel: number;
  activeJetId: string;
  unlockedJetIds: string[];
  upgrades: UpgradeState;
}

export interface HitBoxSpec {
  zone: HitZone;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

export interface Bullet {
  id: number;
  ownerId?: string;
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  team: AircraftTeam;
  age: number;
  damageBody: number;
  damageWing: number;
}
