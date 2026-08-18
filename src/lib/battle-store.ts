export type BattleCategory = "attack" | "power" | "boost" | "spell" | "combo" | "defense";

export interface BattlePackage {
  key: string;
  category: BattleCategory;
  name: string;
  description: string;
  quantity: number;
  price: number;
  damageLabel?: string;
  accentClass: string;
  popular?: boolean;
}

export const battlePackagesByCategory: Record<BattleCategory, BattlePackage[]> = {
  attack: [
    { key: "starter-swipe", category: "attack", name: "5 Attacks", description: "Quick strike starter", quantity: 5, price: 0.2, damageLabel: "5-15 each", accentClass: "text-primary" },
    { key: "rapid-storm", category: "attack", name: "20 Attacks", description: "Solid battle bundle", quantity: 20, price: 0.5, damageLabel: "5-15 each", accentClass: "text-ton-blue", popular: true },
    { key: "arena-burst", category: "attack", name: "50 Attacks", description: "Best value pack", quantity: 50, price: 1.0, damageLabel: "5-15 each", accentClass: "text-neon-green", popular: true },
    { key: "boss-siege", category: "attack", name: "150 Attacks", description: "Boss raid bundle", quantity: 150, price: 2.5, damageLabel: "5-15 each", accentClass: "text-primary" },
    { key: "war-machine", category: "attack", name: "500 Attacks", description: "Ultimate war package", quantity: 500, price: 6.0, damageLabel: "5-15 each", accentClass: "text-destructive" },
  ],
  power: [
    { key: "power-hit", category: "power", name: "Power Strike", description: "Single heavy hit", quantity: 1, price: 0.25, damageLabel: "20-40", accentClass: "text-destructive" },
    { key: "power-hit-x5", category: "power", name: "5x Power Strikes", description: "Five devastating blows", quantity: 5, price: 1.0, damageLabel: "20-40 each", accentClass: "text-destructive", popular: true },
    { key: "power-hit-x10", category: "power", name: "10x Power Strikes", description: "Ten heavy hits combo", quantity: 10, price: 1.8, damageLabel: "20-40 each", accentClass: "text-destructive" },
    { key: "mega-strike", category: "power", name: "Mega Strike", description: "Massive boss damage", quantity: 1, price: 0.5, damageLabel: "50-100", accentClass: "text-primary" },
    { key: "mega-strike-x5", category: "power", name: "5x Mega Strikes", description: "Ultimate boss combo", quantity: 5, price: 2.0, damageLabel: "50-100 each", accentClass: "text-primary", popular: true },
    { key: "mega-strike-x10", category: "power", name: "10x Mega Strikes", description: "Total annihilation", quantity: 10, price: 3.5, damageLabel: "50-100 each", accentClass: "text-primary" },
  ],
  boost: [
    { key: "damage-x2", category: "boost", name: "Double Damage x10", description: "10 boosted attacks", quantity: 10, price: 0.4, damageLabel: "2x DMG", accentClass: "text-neon-green" },
    { key: "damage-x2-25", category: "boost", name: "Double Damage x25", description: "25 boosted attacks", quantity: 25, price: 0.8, damageLabel: "2x DMG", accentClass: "text-neon-green", popular: true },
    { key: "critical-master", category: "boost", name: "Critical x5", description: "5 guaranteed crits", quantity: 5, price: 0.5, damageLabel: "30-45 each", accentClass: "text-ton-blue" },
    { key: "critical-master-15", category: "boost", name: "Critical x15", description: "15 guaranteed crits", quantity: 15, price: 1.2, damageLabel: "30-45 each", accentClass: "text-ton-blue", popular: true },
    { key: "berserker", category: "boost", name: "Berserker Mode x5", description: "5 triple damage attacks", quantity: 5, price: 0.9, damageLabel: "3x DMG", accentClass: "text-destructive" },
  ],
  spell: [
    { key: "ice-storm", category: "spell", name: "Ice Storm", description: "Freezing burst", quantity: 1, price: 0.35, damageLabel: "50 DMG", accentClass: "text-ton-blue" },
    { key: "fire-ball", category: "spell", name: "Fire Ball", description: "Blazing inferno", quantity: 1, price: 0.6, damageLabel: "80 DMG", accentClass: "text-destructive", popular: true },
    { key: "lightning", category: "spell", name: "Lightning Bolt", description: "Electric devastation", quantity: 1, price: 0.9, damageLabel: "120 DMG", accentClass: "text-primary", popular: true },
    { key: "earthquake", category: "spell", name: "Earthquake", description: "Ground-shaking destruction", quantity: 1, price: 1.2, damageLabel: "160 DMG", accentClass: "text-neon-green" },
    { key: "meteor", category: "spell", name: "Meteor Strike", description: "Devastating cosmic impact", quantity: 1, price: 1.8, damageLabel: "250 DMG", accentClass: "text-destructive" },
    { key: "spell-bundle", category: "spell", name: "Spell Bundle (5 random)", description: "5 random spells mix", quantity: 5, price: 2.5, damageLabel: "50-250 each", accentClass: "text-primary" },
  ],
  combo: [
    { key: "starter-combo", category: "combo", name: "Starter Combo", description: "20 attacks + 3 power strikes", quantity: 23, price: 0.9, damageLabel: "Mixed", accentClass: "text-primary", popular: true },
    { key: "warrior-combo", category: "combo", name: "Warrior Pack", description: "50 attacks + 5 mega + boost x10", quantity: 65, price: 2.5, damageLabel: "Mixed", accentClass: "text-ton-blue", popular: true },
    { key: "elite-combo", category: "combo", name: "Elite Bundle", description: "150 attacks + 10 mega + all spells", quantity: 165, price: 5.5, damageLabel: "Mixed", accentClass: "text-neon-green" },
    { key: "ultimate-combo", category: "combo", name: "Ultimate War Pack", description: "500 attacks + 10 mega + 5 meteors", quantity: 515, price: 11.0, damageLabel: "Maximum", accentClass: "text-destructive" },
  ],
  defense: [
    { key: "heal-small", category: "defense", name: "Minor Heal", description: "Restore 50 HP to boss (extends fight)", quantity: 1, price: 0.2, damageLabel: "+50 HP", accentClass: "text-neon-green" },
    { key: "shield-wall", category: "defense", name: "Shield Wall x5", description: "Block 5 bot attacks on you", quantity: 5, price: 0.4, damageLabel: "Block 5", accentClass: "text-ton-blue" },
    { key: "revive-token", category: "defense", name: "Revive Token", description: "Extra life in battle", quantity: 1, price: 0.6, damageLabel: "1 Life", accentClass: "text-primary" },
  ],
};

export const battleCategoryOrder: BattleCategory[] = ["attack", "combo", "power", "boost", "spell", "defense"];

export const battleCategoryLabels: Record<BattleCategory, string> = {
  attack: "Attacks",
  power: "Power",
  boost: "Boosts",
  spell: "Spells",
  combo: "Combos",
  defense: "Defense",
};

export const allBattlePackages = battleCategoryOrder.flatMap((category) => battlePackagesByCategory[category]);

export const getBattlePackage = (category: BattleCategory, key: string) =>
  battlePackagesByCategory[category].find((item) => item.key === key);
