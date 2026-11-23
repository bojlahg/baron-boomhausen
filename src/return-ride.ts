import { clamp, map } from './world';
import type { Point } from './world';

const approachTime = 760;
const saddleTime = 215;
const rideStart = approachTime + saddleTime;

export const horsePastures = { front: map.left + 90, rear: map.right - 112 };

export interface HorseDeparture {
  x: number;
  since: number;
  direction: -1 | 1;
}

export interface ReturnRide {
  from: Point;
  to: Point;
  since: number;
  duration: number;
  direction: -1 | 1;
  deer: boolean;
}

export interface RidePose {
  position: Point;
  spread: number;
  direction: -1 | 1;
  frontTurn: number;
  stride: number;
  bounce: number;
  travel: number;
  mounted: number;
  opacity: number;
  deer: boolean;
}

export function startRide(from: Point, to: Point, since: number, deer: boolean): ReturnRide {
  const distance = Math.abs(to.x - from.x);
  return {
    from, to, since, deer,
    duration: clamp(840 + Math.log2(1 + distance / 80) * 235, 840, 1900),
    direction: to.x <= from.x ? -1 : 1,
  };
}

const smooth = (value: number): number => value * value * (3 - 2 * value);

export function horsePastureAt(half: 'front' | 'rear', departure: HorseDeparture | null, now: number) {
  const destination = horsePastures[half];
  const direction = half === 'front' ? -1 : 1;
  if (!departure) return { x: destination, facing: direction, bounce: 0, pitch: 0, settled: true };

  const origin = departure.x - 1.5 * direction * departure.direction;
  const elapsed = Math.max(0, now - departure.since);
  const travelTime = 900 + 1000 * Math.sqrt(Math.abs(destination - origin) / 75);
  const travel = Math.min(elapsed / travelTime, 1);
  const turn = smooth(Math.min(elapsed / 220, 1));
  const stride = Math.sin(elapsed * 0.023);
  const running = Math.sin(Math.PI * travel);
  return {
    x: origin + (destination - origin) * smooth(travel),
    facing: departure.direction + (direction - departure.direction) * turn,
    bounce: Math.abs(stride) * 3 * running,
    pitch: stride * 0.13 * running,
    settled: travel === 1,
  };
}

export function rideAt(ride: ReturnRide, now: number): RidePose {
  const elapsed = Math.max(0, now - ride.since);
  const approach = Math.min(elapsed / approachTime, 1);
  const travel = clamp((elapsed - rideStart) / ride.duration, 0, 1);
  const mounted = smooth(clamp((elapsed - 570) / 300, 0, 1));
  const dismount = smooth(clamp((travel - 0.80) / 0.20, 0, 1));
  const stride = elapsed / 1000 * Math.PI * 13;
  const running = approach < 1 ? 1 - mounted : Math.sin(Math.PI * travel) ** 0.35;
  const bounce = Math.abs(Math.sin(stride)) * 2.8 * running;
  const saddle = 38 + (ride.from.y - 38) * (1 - mounted);

  return {
    direction: ride.direction, deer: ride.deer, travel, stride, bounce,
    mounted: mounted * (1 - dismount),
    spread: 142 * (1 - approach) ** 2,
    frontTurn: -Math.cos(Math.PI * smooth(clamp((approach - 0.46) / 0.31, 0, 1))),
    opacity: ride.deer ? 1 - dismount : 1,
    position: {
      x: ride.from.x + (ride.to.x - ride.from.x) * smooth(travel),
      y: saddle + bounce * mounted + (ride.to.y - saddle - bounce * mounted) * dismount,
    },
  };
}
