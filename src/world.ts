import * as THREE from "three";
import { GAME } from "./config";
import { Effects } from "./effects";

export interface Obstacle {
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

export class World {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly effects: Effects
  ) {
    scene.add(this.group);
    this.build();
  }

  collidesSphere(position: THREE.Vector3, radius: number): boolean {
    if (position.y < 4) return true;
    const sphere = new THREE.Sphere(position, radius);
    return this.obstacles.some((obstacle) => obstacle.box.intersectsSphere(sphere));
  }

  getAvoidance(position: THREE.Vector3, direction: THREE.Vector3, distance: number): THREE.Vector3 {
    const ray = new THREE.Ray(position, direction.clone().normalize());
    const avoidance = new THREE.Vector3();

    for (const obstacle of this.obstacles) {
      const hit = new THREE.Vector3();
      if (!ray.intersectBox(obstacle.box, hit)) continue;
      const hitDistance = hit.distanceTo(position);
      if (hitDistance > distance) continue;

      const away = position.clone().sub(obstacle.center);
      away.y += 12;
      if (away.lengthSq() > 0.001) {
        avoidance.addScaledVector(away.normalize(), 1 - hitDistance / distance);
      }
    }

    return avoidance;
  }

  randomAirPoint(minRadius = 90): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (GAME.citySize * 0.42);
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      58 + Math.random() * 78,
      Math.sin(angle) * radius
    );
  }

  randomSafeAirPoint(minRadius = 90, clearance = 18): THREE.Vector3 {
    for (let i = 0; i < 80; i += 1) {
      const point = this.randomAirPoint(minRadius);
      if (!this.collidesSphere(point, clearance)) return point;
    }
    return new THREE.Vector3(
      (Math.random() - 0.5) * GAME.citySize * 0.45,
      125,
      (Math.random() - 0.5) * GAME.citySize * 0.45
    );
  }

  private build(): void {
    this.scene.background = new THREE.Color(0x0b1116);
    this.scene.fog = new THREE.FogExp2(0x131b1d, 0.00155);
    this.addSky();

    const hemi = new THREE.HemisphereLight(0xaed2dc, 0x2b2017, 1.45);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffd08a, 3.25);
    sun.position.set(-120, 180, 110);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -360;
    sun.shadow.camera.right = 360;
    sun.shadow.camera.top = 360;
    sun.shadow.camera.bottom = -360;
    this.scene.add(sun);

    const cityGlow = new THREE.PointLight(0x49a6ff, 2.2, 420, 1.6);
    cityGlow.position.set(0, 95, -140);
    this.scene.add(cityGlow);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GAME.citySize, GAME.citySize, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0x161b1b, roughness: 0.98, metalness: 0.02 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    this.addRoads();
    this.addBuildings();
    this.addRubble();
  }

  private addSky(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return;

    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#25384a");
    gradient.addColorStop(0.42, "#172329");
    gradient.addColorStop(1, "#080b0d");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false })
    );
    this.scene.add(sky);
  }

  private addRoads(): void {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x252728, roughness: 0.9 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xc8b66b, transparent: true, opacity: 0.58 });
    for (let i = -3; i <= 3; i += 1) {
      const roadX = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, GAME.citySize), roadMat);
      roadX.position.set(i * 95, 0.05, 0);
      this.group.add(roadX);

      const lineX = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, GAME.citySize), lineMat);
      lineX.position.set(i * 95, 0.12, 0);
      this.group.add(lineX);

      const roadZ = new THREE.Mesh(new THREE.BoxGeometry(GAME.citySize, 0.08, 12), roadMat);
      roadZ.position.set(0, 0.06, i * 95);
      this.group.add(roadZ);

      const lineZ = new THREE.Mesh(new THREE.BoxGeometry(GAME.citySize, 0.1, 0.55), lineMat);
      lineZ.position.set(0, 0.13, i * 95);
      this.group.add(lineZ);
    }
  }

  private addBuildings(): void {
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0x30383a, roughness: 0.82, metalness: 0.12 }),
      new THREE.MeshStandardMaterial({ color: 0x263032, roughness: 0.9, metalness: 0.08 }),
      new THREE.MeshStandardMaterial({ color: 0x3b3631, roughness: 0.9 })
    ];

    for (let x = -320; x <= 320; x += 45) {
      for (let z = -320; z <= 320; z += 45) {
        if (Math.abs(x) < 55 && Math.abs(z) < 55) continue;
        if (Math.abs(x % 95) < 18 || Math.abs(z % 95) < 18) continue;
        if (Math.random() < 0.22) continue;

        const width = 18 + Math.random() * 18;
        const depth = 18 + Math.random() * 18;
        const height = 30 + Math.random() * 115;
        const damaged = Math.random() < 0.28;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(width, damaged ? height * (0.72 + Math.random() * 0.2) : height, depth),
          materials[Math.floor(Math.random() * materials.length)]
        );
        building.position.set(
          x + (Math.random() - 0.5) * 11,
          building.geometry.parameters.height / 2,
          z + (Math.random() - 0.5) * 11
        );
        building.castShadow = true;
        building.receiveShadow = true;
        this.group.add(building);
        this.addBuildingDetails(building, width, building.geometry.parameters.height, depth, damaged);

        const size = new THREE.Vector3(width, building.geometry.parameters.height, depth);
        const center = building.position.clone();
        this.obstacles.push({
          box: new THREE.Box3().setFromCenterAndSize(center, size),
          center,
          size
        });

        if (damaged) {
          const cap = new THREE.Mesh(
            new THREE.ConeGeometry(Math.max(width, depth) * 0.62, 12, 5),
            materials[2]
          );
          cap.position.set(building.position.x, building.position.y + size.y / 2 + 4, building.position.z);
          cap.rotation.y = Math.random() * Math.PI;
          this.group.add(cap);
        }

        if (Math.random() < 0.08) {
          this.effects.smokeColumn(new THREE.Vector3(building.position.x, size.y + 4, building.position.z));
        }
      }
    }

    for (let i = 0; i < 18; i += 1) {
      this.spawnPoints.push(this.randomSafeAirPoint(140, 24));
    }
  }

  private addBuildingDetails(
    building: THREE.Mesh,
    width: number,
    height: number,
    depth: number,
    damaged: boolean
  ): void {
    const windowMat = new THREE.MeshBasicMaterial({
      color: damaged ? 0xff8654 : 0x7fd4ff,
      transparent: true,
      opacity: damaged ? 0.34 : 0.24
    });
    const verticalRows = Math.max(2, Math.floor(height / 18));
    const horizontalRows = Math.max(2, Math.floor(width / 6));

    for (const side of [-1, 1]) {
      const facade = new THREE.Group();
      for (let y = 0; y < verticalRows; y += 1) {
        for (let x = 0; x < horizontalRows; x += 1) {
          if (Math.random() < (damaged ? 0.55 : 0.28)) continue;
          const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), windowMat);
          windowPane.position.set(
            -width * 0.36 + (x / Math.max(1, horizontalRows - 1)) * width * 0.72,
            -height * 0.38 + (y / Math.max(1, verticalRows - 1)) * height * 0.72,
            side * (depth / 2 + 0.03)
          );
          windowPane.rotation.y = side > 0 ? 0 : Math.PI;
          facade.add(windowPane);
        }
      }
      facade.position.copy(building.position);
      this.group.add(facade);
    }

    if (height > 70 && Math.random() < 0.4) {
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff4b35 })
      );
      beacon.position.set(building.position.x, building.position.y + height / 2 + 2.2, building.position.z);
      this.group.add(beacon);

      const light = new THREE.PointLight(0xff4b35, 0.55, 46);
      light.position.copy(beacon.position);
      this.group.add(light);
    }
  }

  private addRubble(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x403d37, roughness: 1 });
    for (let i = 0; i < 130; i += 1) {
      const rubble = new THREE.Mesh(
        new THREE.BoxGeometry(2 + Math.random() * 7, 1 + Math.random() * 5, 2 + Math.random() * 7),
        mat
      );
      rubble.position.set(
        (Math.random() - 0.5) * GAME.citySize,
        1,
        (Math.random() - 0.5) * GAME.citySize
      );
      rubble.rotation.set(Math.random(), Math.random(), Math.random());
      this.group.add(rubble);
    }
  }
}
