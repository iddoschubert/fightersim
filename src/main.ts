import * as THREE from "three";
import "./style.css";
import { Aircraft, createEnemyJetConfig } from "./aircraft";
import { BASE_ENEMY_STATS, GAME, JETS, LEVELS } from "./config";
import { Effects } from "./effects";
import { buyJet, getJet, getPlayerStats } from "./progression";
import { loadSave, resetSave, spendVictoryPoint, storeSave } from "./save";
import type { Bullet, HitZone, SaveState, UpgradeKind } from "./types";
import { UI } from "./ui";
import { World } from "./world";

type GameMode = "menu" | "campaign" | "multiplayer";

interface ServerPlayer {
  id: string;
  position: number[];
  quaternion: number[];
  health: number;
  destroyed: boolean;
}

interface Flare {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  hitIds: Set<Aircraft>;
}

class FighterGame {
  private readonly canvas = document.getElementById("game") as HTMLCanvasElement;
  private readonly renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1800);
  private readonly clock = new THREE.Clock();
  private readonly effects = new Effects(this.scene);
  private readonly world = new World(this.scene, this.effects);
  private readonly ui = new UI();
  private readonly keys = new Set<string>();
  private readonly controlInput = new THREE.Vector2();
  private readonly bullets: Bullet[] = [];
  private readonly flares: Flare[] = [];
  private readonly enemies: Aircraft[] = [];
  private readonly remotePlayers = new Map<string, Aircraft>();
  private readonly temp = {
    v1: new THREE.Vector3(),
    v2: new THREE.Vector3(),
    v3: new THREE.Vector3(),
    ray: new THREE.Ray()
  };

  private save: SaveState = loadSave();
  private player: Aircraft | null = null;
  private level = 1;
  private mode: GameMode = "menu";
  private firing = false;
  private running = false;
  private bulletId = 1;
  private flareCooldown = 0;
  private localPlayerId = "";
  private websocket: WebSocket | null = null;
  private multiplayerStateTimer = 0;

  constructor() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.camera.position.set(0, 36, 58);

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.code === "KeyQ") event.preventDefault();
      this.keys.add(event.code);
    });
    window.addEventListener("keyup", (event) => {
      if (event.code === "Space" || event.code === "KeyQ") event.preventDefault();
      this.keys.delete(event.code);
    });
    window.addEventListener("contextmenu", (event) => event.preventDefault());

    this.ui.continueButton.addEventListener("click", () => this.startMission());
    this.ui.multiplayerButton.addEventListener("click", () => this.startMultiplayer());
    this.ui.resetButton.addEventListener("click", () => {
      this.save = resetSave();
      this.level = 1;
      this.showMainMenu("Save reset.", "Start Mission");
      this.updateHud();
    });

    this.level = Math.min(this.save.highestUnlockedLevel, LEVELS[LEVELS.length - 1]?.level ?? 1);
    this.showMainMenu("Destroy every enemy fighter in the city.", "Start Mission");
    this.updateHud();
    this.loop();
  }

  private showMainMenu(copy: string, label: string): void {
    this.mode = "menu";
    this.running = false;
    this.firing = false;
    this.ui.showMenu({
      title: "Fighter Sim",
      copy,
      save: this.save,
      continueLabel: label,
      canContinue: true,
      onUpgrade: (kind) => this.applyUpgrade(kind),
      onBuyOrEquip: (jetId) => this.buyOrEquip(jetId)
    });
  }

  private startMission(): void {
    this.disconnectMultiplayer();
    this.clearMission();
    this.ui.hideMenu();
    this.mode = "campaign";
    this.running = true;

    const playerStats = getPlayerStats(this.save);
    this.player = new Aircraft("player", playerStats, getJet(this.save.activeJetId));
    this.player.position.set(0, 42, 165);
    this.player.group.lookAt(0, 52, 0);
    this.player.speed = 30;
    this.scene.add(this.player.group);

    const config = LEVELS.find((entry) => entry.level === this.level) ?? LEVELS[0];
    for (let i = 0; i < config.enemyCount; i += 1) {
      const enemy = new Aircraft("enemy", BASE_ENEMY_STATS, createEnemyJetConfig());
      const point = this.world.spawnPoints[i % this.world.spawnPoints.length] ?? this.world.randomSafeAirPoint(160, 24);
      enemy.position.copy(point);
      enemy.group.lookAt(this.world.randomSafeAirPoint(70, 18));
      enemy.speed = BASE_ENEMY_STATS.maxSpeed * (0.68 + Math.random() * 0.2);
      enemy.waypoint.copy(this.world.randomSafeAirPoint(100, 20));
      this.enemies.push(enemy);
      this.scene.add(enemy.group);
    }

    this.ui.showStatus(`Level ${this.level}: eliminate ${config.enemyCount} enemy jets`);
  }

  private clearMission(): void {
    if (this.player) this.scene.remove(this.player.group);
    this.player = null;
    for (const enemy of this.enemies) this.scene.remove(enemy.group);
    this.enemies.length = 0;
    for (const remote of this.remotePlayers.values()) this.scene.remove(remote.group);
    this.remotePlayers.clear();
    for (const bullet of this.bullets) this.scene.remove(bullet.mesh);
    this.bullets.length = 0;
    for (const flare of this.flares) this.scene.remove(flare.mesh);
    this.flares.length = 0;
    this.flareCooldown = 0;
  }

  private loop(): void {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.045);
    if (this.running) {
      this.updatePlayer(dt);
      if (this.mode === "campaign") {
        this.updateEnemies(dt);
      }
      if (this.mode === "multiplayer") {
        this.updateMultiplayer(dt);
      }
      this.updateBullets(dt);
      this.updateFlares(dt);
      this.checkAircraftEnvironmentCollisions();
      if (this.mode === "campaign") {
        this.checkLevelState();
      }
    }
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateHud();
    this.updateRadar();
    this.renderer.render(this.scene, this.camera);
  }

  private updatePlayer(dt: number): void {
    const player = this.player;
    if (!player || player.destroyed) return;

    const rollInput = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
    const pitchInput = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"));
    this.controlInput.lerp(
      new THREE.Vector2(rollInput, pitchInput),
      1 - Math.exp(-dt * 7)
    );

    const rollRate = 1.7;
    const pitchRate = 1.18;
    const rollAmount = this.controlInput.x * rollRate * dt;
    const pitchAmount = this.controlInput.y * pitchRate * dt;

    if (Math.abs(rollAmount) > 0.0001) {
      player.group.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(player.getForward(new THREE.Vector3()), rollAmount)
      );
    }

    if (Math.abs(pitchAmount) > 0.0001) {
      player.group.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(player.getRight(new THREE.Vector3()), pitchAmount)
      );
    }

    player.setVisualBank(0, dt);

    const targetSpeed = player.stats.maxSpeed * 0.74;
    player.speed = THREE.MathUtils.lerp(player.speed, targetSpeed, 1 - Math.exp(-dt * 1.8));
    player.move(dt);

    if (this.keys.has("Space")) this.tryFire(player);
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    this.flareCooldown = Math.max(0, this.flareCooldown - dt);
    if (this.mode === "campaign" && this.keys.has("KeyQ")) this.tryDropFlare(player);
  }

  private updateEnemies(dt: number): void {
    const player = this.player;
    for (const enemy of this.enemies) {
      if (enemy.destroyed) continue;
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
      enemy.blindTimer = Math.max(0, enemy.blindTimer - dt);

      const toPlayer = player ? player.position.clone().sub(enemy.position) : new THREE.Vector3();
      const distanceToPlayer = toPlayer.length();
      const blinded = enemy.blindTimer > 0;
      enemy.aiMode =
        !blinded && player && !player.destroyed && distanceToPlayer < GAME.enemyDetectionRange * 0.68
          ? "chase"
          : "patrol";

      let desired: THREE.Vector3;
      if (blinded) {
        if (enemy.position.distanceTo(enemy.waypoint) < 55) {
          enemy.waypoint.copy(this.world.randomSafeAirPoint(120, 24));
        }
        desired = enemy.waypoint.clone().sub(enemy.position).normalize();
      } else if (enemy.aiMode === "chase" && player) {
        const sloppyOffset = new THREE.Vector3(
          Math.sin(performance.now() * 0.0007 + enemy.position.x * 0.03) * 42,
          Math.sin(performance.now() * 0.0005 + enemy.position.z * 0.025) * 18,
          Math.cos(performance.now() * 0.0006 + enemy.position.y * 0.02) * 42
        );
        desired = player.position.clone().add(sloppyOffset).sub(enemy.position).normalize();
      } else {
        if (enemy.position.distanceTo(enemy.waypoint) < 35) {
          enemy.waypoint.copy(this.world.randomSafeAirPoint(95, 20));
        }
        desired = enemy.waypoint.clone().sub(enemy.position).normalize();
      }

      const forwardAvoidance = this.world.getAvoidance(enemy.position, enemy.getForward(), 110);
      const desiredAvoidance = this.world.getAvoidance(enemy.position, desired, 85);
      if (forwardAvoidance.lengthSq() > 0) {
        desired.addScaledVector(forwardAvoidance.normalize(), 2.6);
      }
      if (desiredAvoidance.lengthSq() > 0) {
        desired.addScaledVector(desiredAvoidance.normalize(), 2.1);
      }
      if (enemy.position.y < 48) desired.y += 0.9;
      desired.normalize();

      enemy.steerToward(desired, dt, enemy.aiMode === "chase" ? 0.72 : 1.0);
      const dangerAhead = forwardAvoidance.lengthSq() > 0;
      const targetSpeed = enemy.stats.maxSpeed * (blinded ? 0.42 : dangerAhead ? 0.48 : 0.82);
      enemy.speed = THREE.MathUtils.lerp(enemy.speed, targetSpeed, dt * 1.4);
      enemy.move(dt);

      if (enemy.aiMode === "chase" && player && distanceToPlayer < GAME.enemyFireRange * 0.58) {
        const alignment = enemy.getForward().dot(player.position.clone().sub(enemy.position).normalize());
        if (alignment > 0.96) this.tryFire(enemy);
      }
    }
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i];
      bullet.age += dt;
      bullet.previousPosition.copy(bullet.position);
      bullet.position.addScaledVector(bullet.velocity, dt);
      bullet.mesh.position.copy(bullet.position);

      const hit = this.findBulletHit(bullet);
      if (hit || bullet.age > GAME.bulletLifetime || this.world.collidesSphere(bullet.position, 0.18)) {
        if (hit) this.handleBulletHit(bullet, hit.aircraft, hit.zone, hit.point);
        else this.effects.impact(bullet.position);
        this.scene.remove(bullet.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  private tryDropFlare(player: Aircraft): void {
    if (this.flareCooldown > 0) return;
    this.flareCooldown = 0.85;

    const forward = player.getForward(new THREE.Vector3());
    const up = player.getUp(new THREE.Vector3());
    const position = player.position
      .clone()
      .addScaledVector(forward, -6.5)
      .addScaledVector(up, -1.6);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95 })
    );
    mesh.position.copy(position);
    this.scene.add(mesh);

    this.flares.push({
      mesh,
      position,
      velocity: forward.clone().multiplyScalar(-42).add(new THREE.Vector3(0, -10, 0)),
      age: 0,
      lifetime: 2.6,
      hitIds: new Set()
    });
    this.effects.muzzle(position, forward.clone().multiplyScalar(-1));
  }

  private updateFlares(dt: number): void {
    const player = this.player;
    for (let i = this.flares.length - 1; i >= 0; i -= 1) {
      const flare = this.flares[i];
      flare.age += dt;
      flare.velocity.y -= 5 * dt;
      flare.position.addScaledVector(flare.velocity, dt);
      flare.mesh.position.copy(flare.position);
      const scale = 1 + Math.sin(flare.age * 42) * 0.18;
      flare.mesh.scale.setScalar(scale);

      if (this.mode === "campaign" && player && !player.destroyed) {
        this.blindEnemiesNearFlare(player, flare);
      }

      if (
        flare.age >= flare.lifetime ||
        this.world.collidesSphere(flare.position, 0.8)
      ) {
        this.effects.impact(flare.position);
        this.scene.remove(flare.mesh);
        this.flares.splice(i, 1);
      }
    }
  }

  private blindEnemiesNearFlare(player: Aircraft, flare: Flare): void {
    const playerForward = player.getForward(new THREE.Vector3());
    for (const enemy of this.enemies) {
      if (enemy.destroyed || flare.hitIds.has(enemy)) continue;
      const enemyOffset = enemy.position.clone().sub(player.position);
      const distanceFromPlayer = enemyOffset.length();
      if (distanceFromPlayer > 125) continue;

      const behindPlayer = enemyOffset.normalize().dot(playerForward.clone().multiplyScalar(-1));
      if (behindPlayer < 0.28) continue;

      const flareDistance = enemy.position.distanceTo(flare.position);
      if (flareDistance > 26) continue;

      enemy.blindTimer = Math.max(enemy.blindTimer, 4.2);
      enemy.fireCooldown = Math.max(enemy.fireCooldown, 4.2);
      enemy.waypoint.copy(this.world.randomSafeAirPoint(130, 24));
      flare.hitIds.add(enemy);
      this.effects.impact(enemy.position.clone());
      this.ui.showStatus("Enemy blinded by flare.");
    }
  }

  private tryFire(aircraft: Aircraft): void {
    if (aircraft.fireCooldown > 0 || aircraft.destroyed) return;
    aircraft.fireCooldown = 1 / aircraft.stats.fireRate;

    const direction = aircraft.getForward(new THREE.Vector3());
    const baseMuzzle = aircraft.position
      .clone()
      .addScaledVector(direction, 5.8)
      .addScaledVector(aircraft.getUp(new THREE.Vector3()), -0.25);
    const right = aircraft.getRight(new THREE.Vector3());
    const velocity = direction.clone().multiplyScalar(GAME.bulletSpeed + aircraft.speed);
    const shotId = this.bulletId;

    for (const side of [-1, 1]) {
      const muzzle = baseMuzzle.clone().addScaledVector(right, side * 1.05);
      this.spawnBullet({
        id: shotId * 10 + (side > 0 ? 1 : 0),
        ownerId: this.mode === "multiplayer" ? this.localPlayerId : undefined,
        team: aircraft.team,
        position: muzzle,
        velocity,
        color: aircraft.team === "player" ? 0xd7f06a : 0xff6f4a
      });
      this.effects.muzzle(muzzle, direction);
    }

    if (this.mode === "multiplayer" && aircraft === this.player) {
      this.sendMultiplayer({
        type: "shot",
        shotId,
        position: baseMuzzle.toArray(),
        velocity: velocity.toArray()
      });
    }
    this.bulletId += 1;
  }

  private spawnBullet(args: {
    id: number;
    ownerId?: string;
    team: "player" | "enemy";
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    color: number;
  }): void {
    const direction = args.velocity.clone().normalize();
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 5.2, 9),
      new THREE.MeshBasicMaterial({ color: args.color })
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    mesh.position.copy(args.position);
    this.scene.add(mesh);

    this.bullets.push({
      id: args.id,
      ownerId: args.ownerId,
      mesh,
      position: args.position.clone(),
      previousPosition: args.position.clone(),
      velocity: args.velocity.clone(),
      team: args.team,
      age: 0,
      damageBody: GAME.bodyDamage,
      damageWing: GAME.wingDamage
    });
  }

  private findBulletHit(
    bullet: Bullet
  ): { aircraft: Aircraft; zone: HitZone; point: THREE.Vector3 } | null {
    const targets = this.getBulletTargets(bullet);

    const delta = bullet.position.clone().sub(bullet.previousPosition);
    const distance = delta.length();
    if (distance <= 0) return null;

    this.temp.ray.origin.copy(bullet.previousPosition);
    this.temp.ray.direction.copy(delta).normalize();

    for (const aircraft of targets) {
      for (const hitBox of aircraft.worldHitBoxes()) {
        const point = this.temp.ray.intersectBox(hitBox.box, new THREE.Vector3());
        if (point && point.distanceTo(bullet.previousPosition) <= distance + 0.1) {
          return { aircraft, zone: hitBox.zone, point };
        }
      }
    }
    return null;
  }

  private handleBulletHit(
    bullet: Bullet,
    aircraft: Aircraft,
    zone: HitZone,
    point: THREE.Vector3
  ): void {
    this.effects.impact(point);
    if (this.mode === "multiplayer") {
      if (bullet.ownerId === this.localPlayerId && aircraft !== this.player) {
        const targetId = this.findRemotePlayerId(aircraft);
        if (targetId) this.sendMultiplayer({ type: "hit", targetId, by: this.localPlayerId });
      }
      if (bullet.ownerId && bullet.ownerId !== this.localPlayerId && aircraft === this.player) {
        this.sendMultiplayer({ type: "hit", targetId: this.localPlayerId, by: bullet.ownerId });
      }
      return;
    }

    if (bullet.team === "player") {
      this.save.coins += GAME.hitCoins;
      storeSave(this.save);
    }

    const destroyed = bullet.team === "player" && aircraft.team === "enemy" ? true : aircraft.damage(zone);
    if (destroyed) {
      aircraft.destroyed = true;
      this.destroyAircraft(aircraft);
      if (bullet.team === "player" && aircraft.team === "enemy") {
        this.save.coins += GAME.killCoins;
        storeSave(this.save);
      }
    }
  }

  private checkAircraftEnvironmentCollisions(): void {
    const aircraft = [this.player, ...this.enemies].filter((item): item is Aircraft => Boolean(item));
    for (const item of aircraft) {
      if (!item.destroyed && this.world.collidesSphere(item.position, item.team === "player" ? 3.2 : 3)) {
        this.destroyAircraft(item, "crash");
      }
    }
  }

  private destroyAircraft(aircraft: Aircraft, cause: "combat" | "crash" | "network" = "combat"): void {
    if (!aircraft.destroyed) aircraft.destroyed = true;
    this.effects.explosion(aircraft.position.clone());
    this.scene.remove(aircraft.group);

    if (aircraft.team === "player" && this.mode === "multiplayer") {
      if (cause === "crash") this.sendMultiplayer({ type: "crash" });
      this.running = false;
      this.firing = false;
      window.setTimeout(() => {
        this.disconnectMultiplayer();
        this.showMainMenu("You were destroyed in the LAN arena.", "Start Mission");
      }, 700);
    }

    if (aircraft.team === "player" && this.mode === "campaign") {
      this.running = false;
      this.firing = false;
      window.setTimeout(() => {
        this.showMainMenu("Mission failed. Repair, upgrade, and try the sortie again.", "Retry Mission");
      }, 700);
    }
  }

  private checkLevelState(): void {
    const liveEnemies = this.enemies.filter((enemy) => !enemy.destroyed);
    if (liveEnemies.length > 0 || !this.player || this.player.destroyed) return;

    this.running = false;
    this.firing = false;
    this.save.victoryPoints += 1;
    const finalLevel = LEVELS[LEVELS.length - 1]?.level ?? this.level;
    if (this.level < finalLevel) {
      this.level += 1;
      this.save.highestUnlockedLevel = Math.max(this.save.highestUnlockedLevel, this.level);
    }
    storeSave(this.save);
    window.setTimeout(() => {
      this.showMainMenu(
        `Level cleared. You earned 1 Victory Point and can upgrade before the next mission.`,
        this.level < finalLevel ? `Start Level ${this.level}` : "Replay Final Level"
      );
    }, 800);
  }

  private applyUpgrade(kind: UpgradeKind): void {
    if (spendVictoryPoint(this.save, kind)) {
      this.ui.showStatus("Upgrade applied.");
      this.refreshMenu();
    }
  }

  private buyOrEquip(jetId: string): void {
    if (buyJet(this.save, jetId)) {
      storeSave(this.save);
      this.ui.showStatus(this.save.unlockedJetIds.includes(jetId) ? "Jet ready." : "Jet purchased.");
      this.refreshMenu();
    }
  }

  private refreshMenu(): void {
    this.ui.rerenderMenu(
      this.save,
      (kind) => this.applyUpgrade(kind),
      (jetId) => this.buyOrEquip(jetId)
    );
    this.updateHud();
  }

  private updateCamera(dt: number): void {
    const player = this.player;
    if (!player) {
      this.camera.lookAt(0, 35, 0);
      return;
    }

    const forward = player.getForward(new THREE.Vector3());
    const up = player.getUp(new THREE.Vector3());
    const desired = player.position
      .clone()
      .addScaledVector(forward, -GAME.cameraDistance)
      .addScaledVector(up, GAME.cameraHeight);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
    this.camera.lookAt(player.position.clone().addScaledVector(forward, 18));
  }

  private updateHud(): void {
    const stats = getPlayerStats(this.save);
    this.ui.updateHud({
      health: this.player?.health ?? stats.maxHealth,
      maxHealth: stats.maxHealth,
      coins: this.save.coins,
      level: this.mode === "multiplayer" ? "LAN" : this.level,
      enemies:
        this.mode === "multiplayer"
          ? [...this.remotePlayers.values()].filter((remote) => !remote.destroyed).length
          : this.enemies.filter((enemy) => !enemy.destroyed).length,
      jetName: getJet(this.save.activeJetId).name,
      victoryPoints: this.save.victoryPoints
    });
  }

  private updateRadar(): void {
    const player = this.player;
    if (!player || player.destroyed) {
      this.ui.updateRadar([]);
      return;
    }

    const radarRange = 320;
    const radarRadius = 72;
    const forward = player.getForward(new THREE.Vector3());
    const right = player.getRight(new THREE.Vector3());
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    const targets =
      this.mode === "multiplayer"
        ? [...this.remotePlayers.values()].filter((remote) => !remote.destroyed)
        : this.enemies.filter((enemy) => !enemy.destroyed);

    const blips = targets.map((target) => {
      const offset = target.position.clone().sub(player.position);
      offset.y = 0;
      const distance = offset.length();
      const clampedDistance = Math.min(distance, radarRange);
      const scale = radarRadius / radarRange;
      return {
        x: THREE.MathUtils.clamp(offset.dot(right) * scale, -radarRadius, radarRadius),
        y: THREE.MathUtils.clamp(-offset.dot(forward) * scale, -radarRadius, radarRadius),
        far: distance > radarRange * 0.65
      };
    });

    this.ui.updateRadar(blips);
  }

  private startMultiplayer(): void {
    this.disconnectMultiplayer();
    this.clearMission();
    this.mode = "multiplayer";
    this.running = false;
    this.localPlayerId = "";
    this.ui.hideMenu();
    this.ui.showStatus("Connecting to LAN arena...");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.websocket = new WebSocket(`${protocol}//${window.location.host}`);
    this.websocket.addEventListener("message", (event) => this.handleMultiplayerMessage(event.data));
    this.websocket.addEventListener("close", () => {
      if (this.mode === "multiplayer") {
        this.running = false;
        this.showMainMenu("Disconnected from the LAN arena. Start with npm run multiplayer and open that LAN URL.", "Start Mission");
      }
    });
    this.websocket.addEventListener("error", () => {
      this.ui.showStatus("LAN connection failed. Use npm run multiplayer, not npm run dev.");
    });
  }

  private handleMultiplayerMessage(raw: string): void {
    const message = JSON.parse(raw) as {
      type: string;
      id?: string;
      by?: string | null;
      players?: ServerPlayer[];
      player?: ServerPlayer;
      position?: number[];
      quaternion?: number[];
      health?: number;
      ownerId?: string;
      shotId?: string;
      velocity?: number[];
    };

    if (message.type === "welcome" && message.id) {
      this.localPlayerId = message.id;
      this.spawnLocalMultiplayerPlayer();
      for (const player of message.players ?? []) {
        if (player.id !== this.localPlayerId) this.upsertRemotePlayer(player);
      }
      this.running = true;
      this.ui.showStatus("LAN arena joined.");
      return;
    }

    if (message.type === "playerJoined" && message.player && message.player.id !== this.localPlayerId) {
      this.upsertRemotePlayer(message.player);
      this.ui.showStatus("Another pilot joined.");
      return;
    }

    if (message.type === "state" && message.id && message.id !== this.localPlayerId) {
      this.upsertRemotePlayer({
        id: message.id,
        position: message.position ?? [0, 80, 0],
        quaternion: message.quaternion ?? [0, 0, 0, 1],
        health: message.health ?? 200,
        destroyed: false
      });
      return;
    }

    if (message.type === "shot" && message.ownerId && message.ownerId !== this.localPlayerId && message.position && message.velocity) {
      this.spawnRemoteBullet(message.ownerId, message.position, message.velocity);
      return;
    }

    if (message.type === "destroyed" && message.id) {
      this.handleMultiplayerDestroyed(message.id);
      return;
    }

    if (message.type === "playerLeft" && message.id) {
      const remote = this.remotePlayers.get(message.id);
      if (remote) this.scene.remove(remote.group);
      this.remotePlayers.delete(message.id);
    }
  }

  private spawnLocalMultiplayerPlayer(): void {
    const stats = getPlayerStats(this.save);
    this.player = new Aircraft("player", stats, getJet(this.save.activeJetId));
    this.player.position.copy(this.world.randomSafeAirPoint(160, 24));
    this.player.group.lookAt(0, 82, 0);
    this.player.speed = stats.maxSpeed * 0.55;
    this.scene.add(this.player.group);
  }

  private upsertRemotePlayer(serverPlayer: ServerPlayer): void {
    let remote = this.remotePlayers.get(serverPlayer.id);
    if (!remote) {
      remote = new Aircraft("enemy", BASE_ENEMY_STATS, createEnemyJetConfig());
      remote.health = serverPlayer.health;
      this.remotePlayers.set(serverPlayer.id, remote);
      this.scene.add(remote.group);
    }
    if (serverPlayer.destroyed || remote.destroyed) return;
    remote.position.fromArray(serverPlayer.position);
    remote.group.quaternion.set(
      serverPlayer.quaternion[0] ?? 0,
      serverPlayer.quaternion[1] ?? 0,
      serverPlayer.quaternion[2] ?? 0,
      serverPlayer.quaternion[3] ?? 1
    );
    remote.health = serverPlayer.health;
  }

  private spawnRemoteBullet(ownerId: string, position: number[], velocity: number[]): void {
    const velocityVector = new THREE.Vector3().fromArray(velocity);
    const direction = velocityVector.clone().normalize();
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
    const basePosition = new THREE.Vector3().fromArray(position);
    for (const side of [-1, 1]) {
      this.spawnBullet({
        id: this.bulletId * 10 + (side > 0 ? 1 : 0),
        ownerId,
        team: "enemy",
        position: basePosition.clone().addScaledVector(right, side * 1.05),
        velocity: velocityVector,
        color: 0xff6f4a
      });
    }
    this.bulletId += 1;
  }

  private updateMultiplayer(dt: number): void {
    const player = this.player;
    if (!player || player.destroyed) return;
    this.multiplayerStateTimer += dt;
    if (this.multiplayerStateTimer < 1 / 20) return;
    this.multiplayerStateTimer = 0;
    this.sendMultiplayer({
      type: "state",
      position: player.position.toArray(),
      quaternion: player.group.quaternion.toArray(),
      health: player.health
    });
  }

  private handleMultiplayerDestroyed(id: string): void {
    if (id === this.localPlayerId && this.player && !this.player.destroyed) {
      this.player.destroyed = true;
      this.destroyAircraft(this.player, "network");
      return;
    }

    const remote = this.remotePlayers.get(id);
    if (remote && !remote.destroyed) {
      remote.destroyed = true;
      this.destroyAircraft(remote, "network");
    }
  }

  private getBulletTargets(bullet: Bullet): Aircraft[] {
    if (this.mode === "multiplayer") {
      if (bullet.ownerId === this.localPlayerId) {
        return [...this.remotePlayers.values()].filter((remote) => !remote.destroyed);
      }
      return this.player && !this.player.destroyed ? [this.player] : [];
    }
    return bullet.team === "player"
      ? this.enemies.filter((enemy) => !enemy.destroyed)
      : this.player && !this.player.destroyed
        ? [this.player]
        : [];
  }

  private findRemotePlayerId(aircraft: Aircraft): string | null {
    for (const [id, remote] of this.remotePlayers) {
      if (remote === aircraft) return id;
    }
    return null;
  }

  private sendMultiplayer(message: unknown): void {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    }
  }

  private disconnectMultiplayer(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.localPlayerId = "";
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

new FighterGame();
