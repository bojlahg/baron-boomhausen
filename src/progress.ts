import { canPlace, chargeLimit, chargeTypes, clamp, ducks, rewardFor, rewardRoutes } from './world';
import type { Charge, ChargeType, Point, Reward, RewardType, Setup, Unlock } from './world';

export interface Progress {
  counts: Record<ChargeType, number>;
  unlocked: Record<Unlock, boolean>;
  height: number;
  range: number;
  duckRecord: number;
  moonHits: 0 | 1 | 2;
  moonCrackAngle: number;
  attempts: number;
  tutorialSeen: boolean;
  lastPath: Point[];
  lastSetup: Setup | null;
}

const legacyChargeType = 'directional-charge';
type SavedProgress = Partial<Omit<Progress, 'counts' | 'lastSetup'>> & {
  counts?: Partial<Record<ChargeType | typeof legacyChargeType, unknown>>;
  lastSetup?: unknown;
  reachedMoon?: boolean;
};

export function startingProgress(): Progress {
  return {
    counts: { 'powder-charge': 3, dynamite: 0, 'powder-barrel': 0, 'heavy-charge': 0, 'royal-bomb': 0 },
    unlocked: { wig: false, mortar: false, cannon: false },
    height: 0, range: 0, duckRecord: 0, moonHits: 0, moonCrackAngle: Math.PI,
    attempts: 0, tutorialSeen: false, lastPath: [], lastSetup: null,
  };
}

export function isUnlock(type: RewardType): type is Unlock {
  return type === 'mortar' || type === 'cannon' || type === 'wig';
}

export function availableRewards(progress: Progress): Map<RewardType, Reward> {
  const visible = new Map<RewardType, Reward>();
  for (const route of rewardRoutes) {
    const { type } = route;
    const slot = isUnlock(type) ? Number(progress.unlocked[type]) : progress.counts[type];
    const reward = slot < chargeLimit ? rewardFor(route, slot) : undefined;
    if (reward) visible.set(type, reward);
  }
  return visible;
}

export function claim(progress: Progress, reward: Reward): boolean {
  const { type, slot } = reward;
  if (isUnlock(type)) {
    if (slot !== 0 || progress.unlocked[type]) return false;
    progress.unlocked[type] = true;
  } else {
    if (progress.counts[type] !== slot || slot >= chargeLimit) return false;
    progress.counts[type]++;
  }
  return true;
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return false;
  return typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y);
}

function isAngle(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && value >= min && value <= max;
}

function readCharge(value: unknown): Charge | null {
  if (!isPoint(value) || !('type' in value)) return null;
  const type = value.type === legacyChargeType ? 'heavy-charge' : chargeTypes.find((type) => type === value.type);
  return type ? { type, x: value.x, y: value.y } : null;
}

function readSetup(value: unknown, progress: Progress): Setup | null {
  if (!value || typeof value !== 'object') return null;
  const { baron, charges, launcher, cannonAngle } = value as Partial<Record<keyof Setup, unknown>>;
  if (!isPoint(baron) || !isAngle(cannonAngle, 30, 90) || !Array.isArray(charges)) return null;
  if (charges.length > chargeTypes.length * chargeLimit) return null;
  if (launcher !== 'none' && ((launcher !== 'mortar' && launcher !== 'cannon') || !progress.unlocked[launcher])) return null;

  const setup: Setup = { baron, charges: [], launcher, cannonAngle };
  if (!canPlace(setup, baron, 'baron')) return null;
  for (const item of charges) {
    const charge = readCharge(item);
    if (!charge || !canPlace(setup, charge, null)) return null;
    if (setup.charges.filter((item) => item.type === charge.type).length >= progress.counts[charge.type]) return null;
    setup.charges.push(charge);
  }
  return setup;
}

export function loadProgress(key: string): Progress {
  const progress = startingProgress();
  try {
    const saved: SavedProgress | null = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object') return progress;
    for (const type of chargeTypes) {
      const stored = saved.counts?.[type] ?? (type === 'heavy-charge' ? saved.counts?.[legacyChargeType] : undefined);
      progress.counts[type] = clamp(Math.floor(number(stored)), progress.counts[type], chargeLimit);
    }
    for (const type of ['wig', 'mortar', 'cannon'] as const) progress.unlocked[type] = saved.unlocked?.[type] === true;
    progress.height = number(saved.height);
    progress.range = number(saved.range);
    progress.duckRecord = clamp(Math.floor(number(saved.duckRecord)), 0, ducks.length);
    const hits = saved.moonHits;
    progress.moonHits = hits === 0 || hits === 1 || hits === 2 ? hits : saved.reachedMoon === true ? 1 : 0;
    if (isAngle(saved.moonCrackAngle, -Math.PI, Math.PI)) progress.moonCrackAngle = saved.moonCrackAngle;
    progress.attempts = Math.floor(number(saved.attempts));
    // Saves created before the tutorial belong to returning players.
    progress.tutorialSeen = saved.tutorialSeen !== false;
    if (Array.isArray(saved.lastPath)) progress.lastPath = saved.lastPath.slice(0, 12000).filter(isPoint);
    progress.lastSetup = readSetup(saved.lastSetup, progress);
  } catch {
    // Play continues if storage is unavailable or the save is damaged.
  }
  return progress;
}

export function saveProgress(progress: Progress, key: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // Blocked or full browser storage does not stop the game.
  }
}
