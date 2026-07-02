import { JETS } from "./config";
import type { SaveState, UpgradeKind } from "./types";
import { getJet } from "./progression";

export class UI {
  private readonly health = requireElement("hud-health");
  private readonly coins = requireElement("hud-coins");
  private readonly level = requireElement("hud-level");
  private readonly enemies = requireElement("hud-enemies");
  private readonly jet = requireElement("hud-jet");
  private readonly vp = requireElement("hud-vp");
  private readonly status = requireElement("status");
  private readonly menu = requireElement("menu");
  private readonly menuTitle = requireElement("menu-title");
  private readonly menuCopy = requireElement("menu-copy");
  private readonly upgradeActions = requireElement("upgrade-actions");
  private readonly shop = requireElement("shop");
  private readonly radarBlips = requireElement("radar-blips");
  readonly continueButton = requireElement("continue-btn") as HTMLButtonElement;
  readonly multiplayerButton = requireElement("multiplayer-btn") as HTMLButtonElement;
  readonly resetButton = requireElement("reset-btn") as HTMLButtonElement;
  private statusTimer = 0;

  updateHud(args: {
    health: number;
    maxHealth: number;
    coins: number;
    level: number | string;
    enemies: number;
    jetName: string;
    victoryPoints: number;
  }): void {
    this.health.textContent = `${Math.max(0, Math.ceil(args.health))}/${args.maxHealth}`;
    this.coins.textContent = String(args.coins);
    this.level.textContent = String(args.level);
    this.enemies.textContent = String(args.enemies);
    this.jet.textContent = args.jetName;
    this.vp.textContent = String(args.victoryPoints);
  }

  updateRadar(blips: Array<{ x: number; y: number; far: boolean }>): void {
    this.radarBlips.replaceChildren();
    for (const blip of blips) {
      const element = document.createElement("div");
      element.className = blip.far ? "radar-blip far" : "radar-blip";
      element.style.transform = `translate(calc(-50% + ${blip.x}px), calc(-50% + ${blip.y}px))`;
      this.radarBlips.append(element);
    }
  }

  showStatus(message: string): void {
    this.status.textContent = message;
    this.status.classList.add("visible");
    window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => this.status.classList.remove("visible"), 2100);
  }

  showMenu(args: {
    title: string;
    copy: string;
    save: SaveState;
    continueLabel: string;
    canContinue: boolean;
    onUpgrade: (kind: UpgradeKind) => void;
    onBuyOrEquip: (jetId: string) => void;
  }): void {
    this.menuTitle.textContent = args.title;
    this.menuCopy.textContent = args.copy;
    this.continueButton.textContent = args.continueLabel;
    this.continueButton.disabled = !args.canContinue;
    this.renderUpgrades(args.save, args.onUpgrade);
    this.renderShop(args.save, args.onBuyOrEquip);
    this.menu.classList.remove("hidden");
  }

  hideMenu(): void {
    this.menu.classList.add("hidden");
  }

  rerenderMenu(save: SaveState, onUpgrade: (kind: UpgradeKind) => void, onBuyOrEquip: (jetId: string) => void): void {
    this.renderUpgrades(save, onUpgrade);
    this.renderShop(save, onBuyOrEquip);
  }

  private renderUpgrades(save: SaveState, onUpgrade: (kind: UpgradeKind) => void): void {
    this.upgradeActions.replaceChildren();
    const entries: Array<[UpgradeKind, string]> = [
      ["speed", "Upgrade Speed +15%"],
      ["fireRate", "Upgrade Fire Rate +15%"],
      ["health", "Upgrade Max Health +15%"]
    ];

    for (const [kind, label] of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${label} (${save.upgrades[kind]})`;
      button.disabled = save.victoryPoints <= 0;
      button.addEventListener("click", () => onUpgrade(kind));
      this.upgradeActions.append(button);
    }
  }

  private renderShop(save: SaveState, onBuyOrEquip: (jetId: string) => void): void {
    this.shop.replaceChildren();
    for (const jet of JETS) {
      const owned = save.unlockedJetIds.includes(jet.id);
      const active = getJet(save.activeJetId).id === jet.id;
      const card = document.createElement("div");
      card.className = "jet-card";

      const title = document.createElement("h2");
      title.textContent = jet.name;
      const copy = document.createElement("p");
      copy.textContent = `${jet.description} Stats x${jet.statMultiplier.toFixed(2)}.`;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = active ? "Equipped" : owned ? "Equip" : `Buy ${jet.price} coins`;
      button.disabled = active || (!owned && save.coins < jet.price);
      button.addEventListener("click", () => onBuyOrEquip(jet.id));

      card.append(title, copy, button);
      this.shop.append(card);
    }
  }
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}
