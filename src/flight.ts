import { ballRadius, chargeRadius, charges, cloudsIn, distance, duckAt, ducks, gravity, moon, radians, rewardAt, start, step } from './world';
import type { Cloud, Point, Reward, RewardType, Setup } from './world';

export const flightSpeed = 1.8;

export interface DuckHit {
  position: Point;
  time: number;
  direction: -1 | 1;
}

export interface CloudHit {
  cloud: Cloud;
  time: number;
  drift: number;
}

export interface Flight {
  position: Point;
  velocity: Point;
  tick: number;
  targetStartTime: number;
  path: Point[];
  height: number;
  range: number;
  rewards: Set<RewardType>;
  ducks: Map<number, DuckHit>;
  clouds: Map<number, CloudHit>;
  wigUsed: boolean;
  outcome: 'landing' | 'moon' | null;
}

export type FlightEvent = { type: 'reward'; reward: Reward; point: Point } | { type: 'duck'; point: Point } | { type: 'wig'; point: Point };

export function impulse(setup: Setup): Point {
  const { baron, launcher, cannonAngle } = setup;
  const aim = radians(cannonAngle);
  const velocity = launcher === 'mortar' ? { x: 0, y: 205 }
    : launcher === 'cannon' ? { x: Math.cos(aim) * 165, y: Math.sin(aim) * 165 }
    : { x: 0, y: 0 };

  for (const charge of setup.charges) {
    const gap = distance(baron, charge);
    if (gap >= chargeRadius) continue;
    const strength = charges[charge.type].force * (1 - gap / chargeRadius);
    const divisor = Math.max(gap, 4);
    velocity.x += (baron.x - charge.x) / divisor * strength;
    velocity.y += (baron.y - charge.y) / divisor * strength;
  }
  return velocity;
}

export function beginFlight(setup: Setup, targetStartTime = 0): Flight {
  return {
    position: { ...setup.baron }, velocity: impulse(setup), tick: 0, targetStartTime, path: [{ ...setup.baron }],
    height: setup.baron.y, range: Math.max(0, setup.baron.x - start.x), rewards: new Set(), ducks: new Map(),
    clouds: new Map(), wigUsed: false, outcome: null,
  };
}

export function targetTimeAt(flight: Flight, simulationTime: number): number {
  return flight.targetStartTime + simulationTime / flightSpeed;
}

// First contact along the segment, including targets already overlapping at its start.
function intercept(from: Point, to: Point, center: Point, radius: number): number | null {
  const x = from.x - center.x;
  const y = from.y - center.y;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  const b = x * dx + y * dy;
  const discriminant = b * b - a * c;
  if (a === 0 || b >= 0 || discriminant < 0) return null;
  const fraction = (-b - Math.sqrt(discriminant)) / a;
  return fraction >= 0 && fraction <= 1 ? fraction : null;
}

function mix(from: Point, to: Point, fraction: number): Point {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

function movingIntercept(from: Point, to: Point, before: Point, after: Point, radius: number): number | null {
  return intercept({ x: from.x - before.x, y: from.y - before.y },
    { x: to.x - after.x, y: to.y - after.y }, { x: 0, y: 0 }, radius);
}

// Approximate the three lobes of the cloud sprite with ellipses in atlas coordinates.
const cloudLobes = [
  { x: 28, y: 38, radiusX: 25, radiusY: 8 },
  { x: 78, y: 30, radiusX: 41, radiusY: 16 },
  { x: 129, y: 39, radiusX: 24, radiusY: 7 },
];

function hitClouds(flight: Flight, from: Point, to: Point, time: number, until: number): void {
  const min = { x: Math.min(from.x, to.x) - ballRadius, y: Math.min(from.y, to.y) - ballRadius };
  const max = { x: Math.max(from.x, to.x) + ballRadius, y: Math.max(from.y, to.y) + ballRadius };
  const targetTime = targetTimeAt(flight, time);
  const nextTargetTime = targetTimeAt(flight, time + step);
  for (const cloud of cloudsIn(min, max, targetTime, nextTargetTime)) {
    if (flight.clouds.has(cloud.id)) continue;
    const shift = cloud.nextX - cloud.x;
    let contact = Infinity;
    for (const lobe of cloudLobes) {
      const x = cloud.x + lobe.x * cloud.scale;
      const y = cloud.y - lobe.y * cloud.scale;
      const radiusX = lobe.radiusX * cloud.scale + ballRadius;
      const radiusY = lobe.radiusY * cloud.scale + ballRadius;
      const at = intercept(
        { x: (from.x - x) / radiusX, y: (from.y - y) / radiusY },
        { x: (to.x - x - shift) / radiusX, y: (to.y - y) / radiusY },
        { x: 0, y: 0 }, 1,
      );
      if (at !== null) contact = Math.min(contact, at);
    }
    if (contact <= until) flight.clouds.set(cloud.id, {
      cloud: { ...cloud, x: cloud.x + shift * contact },
      time: time + contact * step,
      drift: shift / step,
    });
  }
}

export function advance(flight: Flight, availableRewards: ReadonlyMap<RewardType, Reward>, useWig: boolean): FlightEvent[] {
  if (flight.outcome) return [];
  const events: FlightEvent[] = [];
  const from = flight.position;
  if (useWig && !flight.wigUsed) {
    flight.velocity.y += 47;
    flight.wigUsed = true;
    events.push({ type: 'wig', point: from });
  }

  const to = {
    x: from.x + flight.velocity.x * step,
    y: from.y + flight.velocity.y * step - gravity * step * step / 2,
  };
  flight.velocity.y -= gravity * step;
  const landing = to.y <= ballRadius ? (from.y - ballRadius) / (from.y - to.y) : null;
  const lunar = intercept(from, to, moon, moon.radius + ballRadius);
  const until = Math.min(landing ?? 1, lunar ?? 1);
  const time = flight.tick * step;
  const targetTime = targetTimeAt(flight, time);
  const nextTargetTime = targetTimeAt(flight, time + step);

  // Collect on contact with a box. The world definition breaks ties at the same time.
  const contacts: { reward: Reward; at: number; point: Point }[] = [];
  for (const reward of availableRewards.values()) {
    if (flight.rewards.has(reward.type)) continue;
    const before = rewardAt(reward, targetTime);
    const after = rewardAt(reward, nextTargetTime);
    const at = movingIntercept(from, to, before, after, ballRadius + 7);
    if (at !== null && at <= until) contacts.push({ reward, at, point: mix(before, after, at) });
  }
  contacts.sort((a, b) => a.at - b.at);
  for (const { reward, point } of contacts) {
    flight.rewards.add(reward.type);
    events.push({ type: 'reward', reward, point });
  }

  ducks.forEach((duck, index) => {
    if (flight.ducks.has(index)) return;
    const radius = ballRadius + duck.radius;
    const sweepX = duck.span + radius + Math.abs(to.x - from.x);
    const sweepY = duck.lift + radius + Math.abs(to.y - from.y);
    if (Math.abs(duck.x - from.x) > sweepX || Math.abs(duck.y - from.y) > sweepY) return;
    const before = duckAt(index, targetTime);
    const after = duckAt(index, nextTargetTime);
    const at = movingIntercept(from, to, before, after, radius);
    if (at === null || at > until) return;
    const position = mix(before, after, at);
    flight.ducks.set(index, { position, time: time + at * step, direction: after.x < before.x ? -1 : 1 });
    events.push({ type: 'duck', point: position });
  });

  hitClouds(flight, from, to, time, until);
  flight.tick++;
  flight.position = mix(from, to, until);
  flight.height = Math.max(flight.height, flight.position.y);
  flight.range = Math.max(flight.range, flight.position.x - start.x);
  if (lunar !== null && lunar <= until) flight.outcome = 'moon';
  else if (landing !== null) flight.outcome = 'landing';
  if (flight.tick % 8 === 0 || flight.outcome) flight.path.push(flight.position);
  return events;
}
