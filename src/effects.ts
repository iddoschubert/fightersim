import * as THREE from "three";

interface TimedObject {
  object: THREE.Object3D;
  age: number;
  lifetime: number;
  velocity: THREE.Vector3;
  scaleRate: number;
}

export class Effects {
  private readonly timed: TimedObject[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  muzzle(position: THREE.Vector3, direction: THREE.Vector3): void {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95 })
    );
    flash.position.copy(position).addScaledVector(direction, 1.8);
    this.addTimed(flash, 0.07, direction.clone().multiplyScalar(9), -4);

    const light = new THREE.PointLight(0xffd27a, 1.7, 18);
    light.position.copy(flash.position);
    this.addTimed(light, 0.08, direction.clone().multiplyScalar(7), 0);
  }

  impact(position: THREE.Vector3): void {
    for (let i = 0; i < 9; i += 1) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.2 + Math.random() * 0.12, 6, 6),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffd36a : 0xff7048 })
      );
      spark.position.copy(position);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.2) * 14,
        (Math.random() - 0.5) * 18
      );
      this.addTimed(spark, 0.42, velocity, -0.45);
    }
  }

  explosion(position: THREE.Vector3): void {
    const blastLight = new THREE.PointLight(0xff7a38, 5.5, 130);
    blastLight.position.copy(position);
    this.addTimed(blastLight, 0.55, new THREE.Vector3(0, 12, 0), 0);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xff6f2d, transparent: true, opacity: 0.95 })
    );
    core.position.copy(position);
    this.addTimed(core, 0.78, new THREE.Vector3(0, 7, 0), 4.4);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.12, 8, 42),
      new THREE.MeshBasicMaterial({ color: 0xffc16a, transparent: true, opacity: 0.72 })
    );
    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;
    this.addTimed(ring, 0.6, new THREE.Vector3(0, 2, 0), 6);

    for (let i = 0; i < 26; i += 1) {
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(1.2 + Math.random() * 2.2, 12, 12),
        new THREE.MeshStandardMaterial({
          color: i % 4 === 0 ? 0x4a3127 : i % 3 === 0 ? 0x2b3030 : 0x151817,
          transparent: true,
          opacity: 0.62,
          roughness: 1
        })
      );
      smoke.position.copy(position);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 28,
        8 + Math.random() * 22,
        (Math.random() - 0.5) * 28
      );
      this.addTimed(smoke, 2.8 + Math.random() * 0.9, velocity, 1.18);
    }

    for (let i = 0; i < 18; i += 1) {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.28 + Math.random() * 0.8, 0.12 + Math.random() * 0.36, 0.8 + Math.random() * 1.8),
        new THREE.MeshStandardMaterial({ color: 0x3b3a35, metalness: 0.5, roughness: 0.55 })
      );
      shard.position.copy(position);
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 44,
        6 + Math.random() * 18,
        (Math.random() - 0.5) * 44
      );
      this.addTimed(shard, 1.4 + Math.random() * 0.8, velocity, -0.18);
    }
  }

  smokeColumn(position: THREE.Vector3): void {
    for (let i = 0; i < 7; i += 1) {
      const plume = new THREE.Mesh(
        new THREE.SphereGeometry(3 + Math.random() * 2.5, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0x252b2b,
          transparent: true,
          opacity: 0.24,
          roughness: 1
        })
      );
      plume.position.set(
        position.x + (Math.random() - 0.5) * 6,
        position.y + i * 5,
        position.z + (Math.random() - 0.5) * 6
      );
      this.scene.add(plume);
    }
  }

  update(dt: number): void {
    for (let i = this.timed.length - 1; i >= 0; i -= 1) {
      const entry = this.timed[i];
      entry.age += dt;
      entry.object.position.addScaledVector(entry.velocity, dt);
      entry.object.scale.addScalar(entry.scaleRate * dt);

      const opacity = Math.max(0, 1 - entry.age / entry.lifetime);
      const material = (entry.object as THREE.Mesh).material;
      if (material instanceof THREE.Material) {
        material.opacity = opacity;
        material.transparent = true;
      }

      if (entry.age >= entry.lifetime) {
        this.scene.remove(entry.object);
        this.timed.splice(i, 1);
      }
    }
  }

  private addTimed(
    object: THREE.Object3D,
    lifetime: number,
    velocity: THREE.Vector3,
    scaleRate: number
  ): void {
    this.scene.add(object);
    this.timed.push({ object, age: 0, lifetime, velocity, scaleRate });
  }
}
