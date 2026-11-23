export interface Point { x: number; y: number }

export const step = 1 / 120;
export const gravity = 20;
export const ballRadius = 11;
export const chargeLimit = 10;
export const chargeRadius = 45;
export const zone = { left: -55, right: 55, bottom: 8, top: 74 };
export const map = { left: -420, right: 4100, bottom: 0, top: 3100 };
export const skyCeiling = (map.bottom + map.top) / 2;
export const moon = { x: 1400, y: 2500, radius: 103 };

export const charges = {
  'powder-charge': { name: 'Powder Charge', force: 36, color: '#f3bc53' },
  dynamite: { name: 'Dynamite', force: 58, color: '#ff625f' },
  'powder-barrel': { name: 'Powder Barrel', force: 72, color: '#ffa32a' },
  'heavy-charge': { name: 'Heavy Charge', force: 90, color: '#31b6ed' },
  'royal-bomb': { name: 'Royal Bomb', force: 108, color: '#bd60da' },
} as const;

export type ChargeType = keyof typeof charges;
export const chargeTypes = Object.keys(charges) as ChargeType[];
export type Unlock = 'wig' | 'mortar' | 'cannon';
export type Launcher = Exclude<Unlock, 'wig'> | 'none';
export type RewardType = ChargeType | Unlock;
export interface Charge extends Point { type: ChargeType }
export interface Setup { baron: Point; charges: Charge[]; launcher: Launcher; cannonAngle: number }

export const start = { x: 0, y: 34 };

export function startingSetup(): Setup {
  return {
    baron: { ...start },
    charges: [
      { x: -17, y: 20, type: 'powder-charge' },
      { x: -6, y: 20, type: 'powder-charge' },
      { x: 3, y: 17, type: 'powder-charge' },
    ],
    launcher: 'none',
    cannonAngle: 60,
  };
}

export function copySetup(setup: Setup): Setup {
  return { ...setup, baron: { ...setup.baron }, charges: setup.charges.map((charge) => ({ ...charge })) };
}

export function insideZone(point: Point): boolean {
  return point.x >= zone.left && point.x <= zone.right && point.y >= zone.bottom && point.y <= zone.top;
}

export function canPlace(setup: Setup, point: Point, target: Charge | 'baron' | null): boolean {
  if (!insideZone(point)) return false;
  if (target === 'baron') return point.y >= ballRadius + 4 && setup.charges.every((charge) => distance(charge, point) >= 8);
  return distance(setup.baron, point) >= 8 && setup.charges.every((charge) => charge === target || distance(charge, point) >= 5.5);
}

export interface Reward extends Point {
  type: RewardType;
  slot: number;
  color: string;
  amplitude: number;
  period: number;
  phase: number;
}

interface RewardRoute extends Omit<Reward, keyof Point | 'slot'> {
  sites: readonly (readonly [number, number])[];
}

export const rewardRoutes: readonly RewardRoute[] = [
  {
    type: 'powder-charge', color: charges['powder-charge'].color, amplitude: 5, period: 5.4, phase: 0.85,
    // The first three slots are already unlocked when the player starts.
    sites: [[-38, 86], [67, 78], [-68, 108], [53, 116], [-92, 140], [238, 170], [-196, 285], [470, 330], [825, 198], [292, 660]],
  },
  {
    type: 'dynamite', color: charges.dynamite.color, amplitude: 8, period: 4.9, phase: 2.1,
    sites: [[224, 43], [-175, 66], [390, 115], [-257, 202], [370, 309], [670, 110], [490, 780], [1040, 395], [-355, 940], [1550, 1080]],
  },
  {
    type: 'powder-barrel', color: charges['powder-barrel'].color, amplitude: 10, period: 6.2, phase: 4.2,
    sites: [[-150, 218], [320, 260], [-95, 435], [550, 135], [-345, 520], [950, 595], [615, 945], [1180, 765], [-160, 1250], [1810, 460]],
  },
  { type: 'wig', color: '#6ed79d', amplitude: 11, period: 5.6, phase: 1.6, sites: [[146, 398]] },
  {
    type: 'heavy-charge', color: charges['heavy-charge'].color, amplitude: 12, period: 6.8, phase: 3.5,
    sites: [[608, 226], [270, 377], [-379, 280], [332, 610], [867, 515], [680, 1125], [1405, 750], [180, 1450], [1960, 980], [2480, 640]],
  },
  {
    type: 'royal-bomb', color: charges['royal-bomb'].color, amplitude: 13, period: 5.9, phase: 5,
    sites: [[-288, 790], [520, 1190], [1305, 580], [-310, 1430], [1100, 1210], [1960, 410], [745, 1680], [2500, 910], [-250, 1860], [3150, 1170]],
  },
  { type: 'mortar', color: '#bceaff', amplitude: 12, period: 6.6, phase: 0.9, sites: [[204, 1210]] },
  { type: 'cannon', color: '#bceaff', amplitude: 12, period: 5.3, phase: 2.8, sites: [[1685, 566]] },
];

export function rewardFor(route: RewardRoute, slot: number): Reward | undefined {
  const site = route.sites[slot];
  if (!site) return undefined;
  const { type, color, amplitude, period, phase } = route;
  return { type, slot, x: site[0], y: site[1], color, amplitude, period, phase };
}

export function rewardAt(reward: Reward, time: number): Point {
  const phase = reward.phase + time * (2 * Math.PI / reward.period);
  return { x: reward.x, y: reward.y + reward.amplitude * Math.sin(phase) };
}

export const rewardNames: Record<RewardType, string> = {
  'powder-charge': charges['powder-charge'].name,
  dynamite: charges.dynamite.name,
  'powder-barrel': charges['powder-barrel'].name,
  'heavy-charge': charges['heavy-charge'].name,
  'royal-bomb': charges['royal-bomb'].name,
  wig: 'Wig',
  mortar: 'Mortar',
  cannon: 'Cannon',
};

export interface Cloud extends Point {
  id: number;
  scale: number;
  opacity: number;
}

function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

interface CloudRoute extends Point {
  scale: number;
  span: number;
}

interface CloudSweep extends Cloud {
  nextX: number;
}

const cloudFieldWidth = 6400;
const cloudBaseAltitude = 105;
const cloudSpriteWidth = 158;
const cloudSpriteHeight = 48;
const maxCloudScale = 0.36;
const maxCloudSpan = 109;
const cloudClearance = 46;

function cloudRoute(x: number, y: number, scale: number): CloudRoute {
  const height = (y - cloudBaseAltitude) / (skyCeiling - cloudBaseAltitude);
  return { x, y, scale, span: maxCloudSpan - 74 * height };
}

function cloudClearanceSquared(route: CloudRoute, routes: readonly CloudRoute[]): number {
  let closest = Infinity;
  for (const other of routes) {
    const deltaX = Math.abs(route.x - other.x);
    const wrappedX = Math.min(deltaX, cloudFieldWidth - deltaX);
    const scale = (route.scale + other.scale) / 2;
    // Both clouds share the wind phase, so only the difference of their spans can close the gap.
    const gapX = Math.max(0, wrappedX - Math.abs(route.span - other.span) - cloudSpriteWidth * scale);
    const gapY = Math.max(0, Math.abs(route.y - other.y) - cloudSpriteHeight * scale);
    closest = Math.min(closest, gapX * gapX + gapY * gapY);
  }
  return closest;
}

function makeCloudRoutes(): CloudRoute[] {
  const random = seededRandom(0xC10D);
  const routes = [cloudRoute(110, 156, 0.34), cloudRoute(cloudFieldWidth - 86, 115, 0.30)];
  while (routes.length < 180) {
    let best: CloudRoute | undefined;
    let clearance = cloudClearance ** 2;
    for (let i = 0; i < 16; i++) {
      const scale = 0.22 + random() * 0.14;
      const halfHeight = cloudSpriteHeight * scale / 2;
      const x = random() * cloudFieldWidth;
      const y = cloudBaseAltitude + halfHeight + random() * (skyCeiling - cloudBaseAltitude - 2 * halfHeight);
      const route = cloudRoute(x, y, scale);
      const score = cloudClearanceSquared(route, routes);
      if (score <= clearance) continue;
      best = route;
      clearance = score;
    }
    if (!best) break;
    routes.push(best);
  }
  return routes.sort((a, b) => a.y - b.y);
}

const cloudRoutes = makeCloudRoutes();

function cloudWind(time: number): number {
  return 0.81 * Math.sin(time * 0.043) + 0.19 * Math.sin(time * 0.019);
}

export function* cloudsIn(min: Point, max: Point, time: number, nextTime = time): Generator<CloudSweep> {
  if (max.y < cloudBaseAltitude || min.y > skyCeiling) return;
  const margin = maxCloudSpan + cloudSpriteWidth * maxCloudScale / 2;
  const firstField = Math.floor((min.x - margin) / cloudFieldWidth);
  const lastField = Math.floor((max.x + margin) / cloudFieldWidth);
  const wind = cloudWind(time);
  const nextWind = nextTime === time ? wind : cloudWind(nextTime);
  for (let field = firstField; field <= lastField; field++) {
    for (let i = 0; i < cloudRoutes.length; i++) {
      const route = cloudRoutes[i]!;
      if (route.y - cloudSpriteHeight * maxCloudScale / 2 > max.y) break;
      const halfHeight = cloudSpriteHeight * route.scale / 2;
      const y = route.y + halfHeight;
      if (y < min.y || route.y - halfHeight > max.y) continue;
      const width = cloudSpriteWidth * route.scale;
      const left = route.x + field * cloudFieldWidth - width / 2;
      const x = left + route.span * wind;
      const nextX = left + route.span * nextWind;
      if (Math.max(x, nextX) + width < min.x || Math.min(x, nextX) > max.x) continue;
      yield {
        x, nextX, y, id: field * cloudRoutes.length + i, scale: route.scale,
        opacity: 0.94 * (skyCeiling - y) / (skyCeiling - map.bottom),
      };
    }
  }
}

interface DuckRoute extends Point {
  span: number;
  lift: number;
  phase: number;
  verticalPhase: number;
  verticalCycles: number;
  speed: number;
  radius: number;
}

function routeClearanceSquared(route: DuckRoute, flock: readonly DuckRoute[]): number {
  let nearest = Infinity;
  for (const other of flock) {
    const gapX = Math.max(0, Math.abs(route.x - other.x) - route.span - other.span);
    const gapY = Math.max(0, Math.abs(route.y - other.y) - route.lift - other.lift);
    nearest = Math.min(nearest, gapX * gapX + gapY * gapY);
  }
  return nearest;
}

function makeDuckRoutes(): DuckRoute[] {
  const random = seededRandom(0xB00F);
  const minimumAltitude = map.bottom + 48;
  const radius = 6.5;
  function candidate(): DuckRoute {
    const span = 29 + random() * 42;
    const lift = 9 + random() * 23;
    return {
      x: map.left + span + random() * (map.right - map.left - 2 * span),
      y: minimumAltitude + lift + random() * (skyCeiling - minimumAltitude - 2 * lift),
      span, lift, radius,
      phase: random() * 2 * Math.PI,
      verticalPhase: random() * 2 * Math.PI,
      verticalCycles: random() < 0.28 ? 2 : 1,
      speed: 0.4 + random() * 0.42,
    };
  }

  // Reserve a low route within reach of the starting charges.
  const flock: DuckRoute[] = [{ x: 102, y: 105, span: 38, lift: 13, radius, phase: 2.2, verticalPhase: 0, verticalCycles: 2, speed: 0.65 }];
  while (flock.length < 150) {
    let best = candidate();
    let clearance = routeClearanceSquared(best, flock);
    // Spread out the entire routes so they stay separated at every phase.
    for (let i = 1; i < 32; i++) {
      const route = candidate();
      const score = routeClearanceSquared(route, flock);
      if (score > clearance) {
        best = route;
        clearance = score;
      }
    }
    flock.push(best);
  }
  return flock;
}

export const ducks: readonly DuckRoute[] = makeDuckRoutes();

export function duckAt(index: number, time: number): Point {
  const duck = ducks[index]!;
  const phase = duck.phase + time * duck.speed;
  return { x: duck.x + Math.sin(phase) * duck.span, y: duck.y + Math.sin(phase * duck.verticalCycles + duck.verticalPhase) * duck.lift };
}

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
export const radians = (degrees: number): number => degrees * Math.PI / 180;
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
