import { advance, beginFlight, impulse } from './flight';
import type { Flight } from './flight';
import type { Progress } from './progress';
import { ballRadius, canPlace, chargeRadius, charges, chargeTypes, clamp, distance, gravity, moon, start, step, zone } from './world';
import type { Point, Reward, RewardType, Setup } from './world';

export type ShotTarget =
  | { kind: 'moon' }
  | { kind: 'reward'; reward: Reward }
  | { kind: 'point'; point: Point };

export function reachedTarget(target: ShotTarget, flight: Flight, from: Point): boolean {
  if (target.kind === 'moon') return flight.outcome === 'moon';
  if (target.kind === 'reward') return flight.rewards.has(target.reward.type);

  const { point } = target;
  const dx = flight.position.x - from.x;
  const dy = flight.position.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared ? clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1) : 0;
  return distance(point, { x: from.x + dx * along, y: from.y + dy * along }) <= ballRadius;
}

// A row of charges points at the same angle. Moving the entire row back decreases thrust.
function placeCharges(base: Setup, thrust: Point, counts: Progress['counts']): Setup | null {
  const speed = Math.hypot(thrust.x, thrust.y);
  if (speed < 1e-6) return base;
  const direction = { x: thrust.x / speed, y: thrust.y / speed };
  const { baron } = base;
  const room = Math.min(
    (direction.x > 0 ? baron.x - zone.left : zone.right - baron.x) / Math.abs(direction.x),
    (direction.y > 0 ? baron.y - zone.bottom : zone.top - baron.y) / Math.abs(direction.y),
  );
  const gap = 8.05;
  const spacing = 5.75;
  for (const type of chargeTypes) {
    const { force } = charges[type];
    for (let amount = 1; amount <= counts[type]; amount++) {
      let near = gap;
      let far = room - (amount - 1) * spacing;
      if (far < near) break;
      const thrustAt = (firstGap: number): number => {
        let total = 0;
        for (let i = 0; i < amount; i++) total += force * Math.max(0, 1 - (firstGap + i * spacing) / chargeRadius);
        return total;
      };
      if (speed > thrustAt(near) || speed < thrustAt(far)) continue;
      for (let i = 0; i < 24; i++) {
        const middle = (near + far) / 2;
        if (thrustAt(middle) > speed) near = middle;
        else far = middle;
      }
      const setup: Setup = { ...base, charges: [] };
      for (let i = 0; i < amount; i++) {
        const offset = (near + far) / 2 + i * spacing;
        const charge = { type, x: baron.x - direction.x * offset, y: baron.y - direction.y * offset };
        if (!canPlace(setup, charge, null)) break;
        setup.charges.push(charge);
      }
      if (setup.charges.length === amount) return setup;
    }
  }
  return null;
}

function verify(setup: Setup, target: ShotTarget, until: number): boolean {
  const flight = beginFlight(setup);
  const rewards = new Map<RewardType, Reward>(target.kind === 'reward' ? [[target.reward.type, target.reward]] : []);
  while (!flight.outcome && flight.tick * step <= until) {
    const from = flight.position;
    advance(flight, rewards, false);
    if (reachedTarget(target, flight, from)) return true;
  }
  return false;
}

export function buildShot(target: ShotTarget, inventory: Pick<Progress, 'counts' | 'unlocked'>): Setup | null {
  const center = target.kind === 'moon' ? moon : target.kind === 'reward' ? target.reward : target.point;
  const heights = [start.y, 44];
  const timeFactors = [1, 0.9, 1.1, 0.8, 1.2, 0.65, 1.4, 0.5, 1.65, 0.35, 0.25, 0.15];
  for (const y of heights) {
    const baron = { x: start.x, y };
    const efficientTime = Math.sqrt(2 * distance(baron, center) / gravity);
    const bases: Setup[] = [{ baron, launcher: 'none', cannonAngle: 60, charges: [] }];
    if (inventory.unlocked.mortar) bases.push({ ...bases[0]!, launcher: 'mortar' });
    if (inventory.unlocked.cannon) {
      for (const cannonAngle of [30, 45, 60, 75, 90]) bases.push({ ...bases[0]!, launcher: 'cannon', cannonAngle });
    }
    for (const factor of timeFactors) {
      const time = Math.max(0.25, efficientTime * factor);
      // Aim at the midpoint of a crate's swing so the setup still works after waiting to fire.
      const velocity = { x: (center.x - baron.x) / time, y: (center.y - baron.y) / time + gravity * time / 2 };
      for (const base of bases) {
        const launch = impulse(base);
        const setup = placeCharges(base, { x: velocity.x - launch.x, y: velocity.y - launch.y }, inventory.counts);
        if (setup && (setup.charges.length > 0 || setup.launcher !== 'none') && verify(setup, target, time + step)) return setup;
      }
    }
  }
  return null;
}
