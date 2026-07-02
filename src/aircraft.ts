import * as THREE from "three";
import type { AircraftStats, AircraftTeam, HitBoxSpec, HitZone, JetConfig } from "./types";

const forward = new THREE.Vector3(0, 0, -1);
const up = new THREE.Vector3(0, 1, 0);

export class Aircraft {
  readonly group = new THREE.Group();
  private readonly visualModel: THREE.Group;
  readonly hitBoxes: HitBoxSpec[];
  health: number;
  speed = 0;
  destroyed = false;
  fireCooldown = 0;
  blindTimer = 0;
  aiMode: "patrol" | "chase" = "patrol";
  waypoint = new THREE.Vector3();

  constructor(
    readonly team: AircraftTeam,
    readonly stats: AircraftStats,
    readonly jet: JetConfig
  ) {
    this.health = stats.maxHealth;
    this.visualModel = createJetModel(jet, team);
    this.group.add(this.visualModel);
    this.hitBoxes = createHitBoxes(jet.tier);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  getForward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(forward).applyQuaternion(this.group.quaternion).normalize();
  }

  getUp(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(up).applyQuaternion(this.group.quaternion).normalize();
  }

  getRight(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(1, 0, 0).applyQuaternion(this.group.quaternion).normalize();
  }

  steerToward(direction: THREE.Vector3, dt: number, responsiveness = 1): void {
    if (direction.lengthSq() < 0.0001) return;
    const normalized = direction.clone().normalize();
    const right = this.getRight();
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(forward, normalized);
    this.group.quaternion.rotateTowards(targetQuat, this.stats.turnRate * responsiveness * dt);

    const targetBank = THREE.MathUtils.clamp(right.dot(normalized), -1, 1) * 0.5;
    this.visualModel.rotation.z = THREE.MathUtils.lerp(
      this.visualModel.rotation.z,
      targetBank,
      1 - Math.exp(-dt * 8)
    );
  }

  setControlledOrientation(yaw: number, pitch: number, bankInput: number, dt: number): void {
    const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
    this.group.quaternion.rotateTowards(targetQuat, this.stats.turnRate * 1.45 * dt);
    this.setVisualBank(bankInput, dt);
  }

  setVisualBank(bankInput: number, dt: number): void {
    this.visualModel.rotation.z = THREE.MathUtils.lerp(
      this.visualModel.rotation.z,
      THREE.MathUtils.clamp(bankInput, -1, 1) * 0.52,
      1 - Math.exp(-dt * 9)
    );
  }

  move(dt: number): void {
    this.position.addScaledVector(this.getForward(), this.speed * dt);
    this.position.y = THREE.MathUtils.clamp(this.position.y, 16, 155);
  }

  damage(zone: HitZone): boolean {
    this.health -= zone === "body" ? 13 : 7;
    if (this.health <= 0) {
      this.destroyed = true;
      return true;
    }
    return false;
  }

  worldHitBoxes(): Array<{ zone: HitZone; box: THREE.Box3 }> {
    this.group.updateMatrixWorld(true);
    return this.hitBoxes.map((spec) => {
      const half = spec.size.clone().multiplyScalar(0.5);
      const corners = [
        new THREE.Vector3(-half.x, -half.y, -half.z),
        new THREE.Vector3(half.x, -half.y, -half.z),
        new THREE.Vector3(-half.x, half.y, -half.z),
        new THREE.Vector3(half.x, half.y, -half.z),
        new THREE.Vector3(-half.x, -half.y, half.z),
        new THREE.Vector3(half.x, -half.y, half.z),
        new THREE.Vector3(-half.x, half.y, half.z),
        new THREE.Vector3(half.x, half.y, half.z)
      ];

      const box = new THREE.Box3();
      for (const corner of corners) {
        box.expandByPoint(corner.add(spec.center).applyMatrix4(this.group.matrixWorld));
      }
      return { zone: spec.zone, box };
    });
  }
}

export function createEnemyJetConfig(): JetConfig {
  return {
    id: "enemy",
    name: "Raider Drone",
    price: 0,
    tier: 2,
    description: "Hostile city patrol aircraft.",
    statMultiplier: 1
  };
}

function createHitBoxes(tier: number): HitBoxSpec[] {
  const wingSpan = tier >= 2 ? 9.8 : 11.5;
  return [
    {
      zone: "body",
      center: new THREE.Vector3(0, 0, -0.1),
      size: new THREE.Vector3(2.4, 2.3, 9.8)
    },
    {
      zone: "wing",
      center: new THREE.Vector3(-wingSpan * 0.34, -0.1, 0.4),
      size: new THREE.Vector3(wingSpan * 0.62, 0.7, 3.4)
    },
    {
      zone: "wing",
      center: new THREE.Vector3(wingSpan * 0.34, -0.1, 0.4),
      size: new THREE.Vector3(wingSpan * 0.62, 0.7, 3.4)
    }
  ];
}

function createJetModel(jet: JetConfig, team: AircraftTeam): THREE.Group {
  const model = new THREE.Group();
  const playerPalette = [0x8d7b62, 0x4d8fa8, 0x6d747d, 0x1f2529];
  const baseColor = team === "enemy" ? 0x9d3030 : playerPalette[Math.min(jet.tier, 3)];
  const trimColor = team === "enemy" ? 0xff6f4a : 0xd7f06a;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    metalness: 0.36 + jet.tier * 0.13,
    roughness: 0.44,
    emissive: team === "enemy" ? 0x2f0805 : 0x050b0d,
    emissiveIntensity: team === "enemy" ? 0.18 : 0.05
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    metalness: 0.35,
    roughness: 0.28,
    emissive: trimColor,
    emissiveIntensity: team === "enemy" ? 0.18 : 0.12
  });

  const bodyLength = 8.4 + jet.tier * 0.7;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.85, bodyLength, 8, 18),
    bodyMat
  );
  body.rotation.x = Math.PI / 2;
  model.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.92, 2.2 + jet.tier * 0.35, 18),
    trimMat
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -(bodyLength / 2 + 1);
  model.add(nose);

  const wingShape = new THREE.Shape();
  const span = 5.2 - jet.tier * 0.35;
  const root = 2.2 + jet.tier * 0.15;
  if (jet.tier < 2) {
    wingShape.moveTo(0, -root);
    wingShape.lineTo(-span, 0.1);
    wingShape.lineTo(0, root);
  } else {
    wingShape.moveTo(0, -root);
    wingShape.lineTo(-span, -0.35);
    wingShape.lineTo(-span * 0.55, 1.3);
    wingShape.lineTo(0, root);
  }
  wingShape.lineTo(0, -root);

  const wingGeom = new THREE.ExtrudeGeometry(wingShape, { depth: 0.16, bevelEnabled: false });
  wingGeom.rotateX(Math.PI / 2);

  const leftWing = new THREE.Mesh(
    wingGeom,
    bodyMat
  );
  leftWing.position.z = 0.25;
  model.add(leftWing);

  const rightWing = leftWing.clone();
  rightWing.scale.x = -1;
  model.add(rightWing);

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(1.3, 2.2, 3),
    bodyMat
  );
  tail.rotation.x = Math.PI / 2;
  tail.rotation.z = Math.PI / 6;
  tail.position.z = bodyLength / 2 + 0.7;
  tail.position.y = 0.9;
  tail.scale.set(0.8, 1, 1);
  model.add(tail);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x7fd4ff, metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.7 })
  );
  canopy.scale.set(0.7, 0.45, 1.2);
  canopy.position.set(0, 0.72, -1.25);
  model.add(canopy);
  addWingtipLight(model, -span + 0.4, 0.2, team === "enemy" ? 0xff3a2f : 0x39ff88);
  addWingtipLight(model, span - 0.4, 0.2, team === "enemy" ? 0xffa43a : 0xff4a4a);

  if (jet.tier === 0) {
    const prop = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 3.3, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x1e1b18 })
    );
    prop.position.z = -(bodyLength / 2 + 2.2);
    model.add(prop);
    const exhaust = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9a45, transparent: true, opacity: 0.7 })
    );
    exhaust.position.set(0, -0.1, bodyLength / 2 + 1.05);
    model.add(exhaust);
  } else {
    const leftEngine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x242829, emissive: 0x1b4d68, emissiveIntensity: 0.35 })
    );
    leftEngine.rotation.x = Math.PI / 2;
    leftEngine.position.set(-0.62, -0.1, bodyLength / 2 + 0.6);
    model.add(leftEngine);
    const rightEngine = leftEngine.clone();
    rightEngine.position.x = 0.62;
    model.add(rightEngine);
    addEngineGlow(model, -0.62, bodyLength / 2 + 1.22, team);
    addEngineGlow(model, 0.62, bodyLength / 2 + 1.22, team);
  }

  return model;
}

function addWingtipLight(model: THREE.Group, x: number, z: number, color: number): void {
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  light.position.set(x, 0.02, z);
  model.add(light);
}

function addEngineGlow(model: THREE.Group, x: number, z: number, team: AircraftTeam): void {
  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.9, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: team === "enemy" ? 0xff5f3d : 0x66d9ff,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, -0.05, z);
  model.add(glow);
}
