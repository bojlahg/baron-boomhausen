import { game } from './assets/atlas-frames.json';
import { clamp, hareShelters, map } from './world';
import type { Point } from './world';

const approachTime = 760;
const saddleTime = 215;
const rideStart = approachTime + saddleTime;
const hopWindup = 235;
const [leftBush, rightBush] = hareShelters;
const bushHalfWidth = game.frames['hare-bush'].width / 2;

export const horsePastures = { front: map.left + 90, rear: map.right - 112 };

export interface HorseDeparture {
  x: number;
  since: number;
  direction: -1 | 1;
}

interface ReturnPath {
  from: Point;
  to: Point;
  since: number;
  duration: number;
  direction: -1 | 1;
}

export type ReturnTrip = ReturnPath & ({ kind: 'hop' } | { kind: 'ride'; deer: boolean });

interface ReturnPosition {
  position: Point;
  direction: -1 | 1;
  travel: number;
}

export interface RidePose extends ReturnPosition {
  kind: 'ride';
  spread: number;
  frontTurn: number;
  stride: number;
  bounce: number;
  mounted: number;
  opacity: number;
  deer: boolean;
}

export type ReturnPose = RidePose | (ReturnPosition & { kind: 'hop'; lift: number });

export function startReturn(from: Point, to: Point, since: number, deer: boolean): ReturnTrip {
  const distance = Math.abs(to.x - from.x);
  const direction = to.x < from.x ? -1 : 1;
  const path = { from, to, since, direction } as const;
  const betweenBushes = from.x >= leftBush.x + bushHalfWidth * leftBush.scale
    && from.x <= rightBush.x - bushHalfWidth * rightBush.scale;
  if (betweenBushes) return { ...path, kind: 'hop', duration: clamp(440 + distance * 2, 440, 720) };
  return {
    ...path, kind: 'ride', deer,
    duration: clamp(840 + Math.log2(1 + distance / 80) * 235, 840, 1900),
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

export function returnAt(ride: ReturnTrip, now: number): ReturnPose {
  const elapsed = Math.max(0, now - ride.since);
  if (ride.kind === 'hop') {
    const travel = clamp((elapsed - hopWindup) / ride.duration, 0, 1);
    const lift = 4 * travel * (1 - travel);
    const height = clamp(14 + Math.abs(ride.to.x - ride.from.x) * 0.12, 14, 34);
    return {
      kind: 'hop', direction: ride.direction, travel, lift,
      position: {
        x: ride.from.x + (ride.to.x - ride.from.x) * smooth(travel),
        y: ride.from.y + (ride.to.y - ride.from.y) * travel + height * lift,
      },
    };
  }

  const approach = Math.min(elapsed / approachTime, 1);
  const travel = clamp((elapsed - rideStart) / ride.duration, 0, 1);
  const mounted = smooth(clamp((elapsed - 570) / 300, 0, 1));
  const dismount = smooth(clamp((travel - 0.80) / 0.20, 0, 1));
  const stride = elapsed / 1000 * Math.PI * 13;
  const running = approach < 1 ? 1 - mounted : Math.sin(Math.PI * travel) ** 0.35;
  const bounce = Math.abs(Math.sin(stride)) * 2.8 * running;
  const saddle = 38 + (ride.from.y - 38) * (1 - mounted);

  return {
    kind: 'ride', direction: ride.direction, deer: ride.deer, travel, stride, bounce,
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
