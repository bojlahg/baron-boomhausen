import { game, ui } from './assets/atlas-frames.json';
import gameUrl from './assets/game-atlas.svg';
import uiUrl from './assets/ui-atlas.svg';
import { paintBaron } from './baron';
import type { BaronMotion } from './baron';
import type { ParticleEffects } from './effects';
import type { CloudHit, DuckHit } from './flight';
import { paintLandscape } from './landscape';
import { horsePastureAt, horsePastures } from './return-ride';
import type { HorseDeparture, RidePose } from './return-ride';
import { drawSprite } from './sprites';
import type { GameSprite } from './sprites';
import { charges, clamp, cloudsIn, duckAt, ducks, map, moon, radians, rewardAt, start, zone } from './world';
import type { Charge, Point, Reward, RewardType, Setup } from './world';

export type UiSprite = keyof typeof ui.frames;

export interface Camera extends Point { zoom: number; width: number; height: number }
export interface Effect { sprite: GameSprite; point: Point; since: number; duration: number; size: number }
export interface Scene {
  setup: Setup;
  position: Point;
  baron: BaronMotion;
  mode: 'prepare' | 'flight' | 'result';
  targetTime: number;
  animationTime: number;
  now: number;
  visibleRewards: ReadonlyMap<RewardType, Reward>;
  lastPath: readonly Point[];
  currentPath: readonly Point[];
  duckHits: ReadonlyMap<number, DuckHit> | null;
  cloudHits: ReadonlyMap<number, CloudHit> | null;
  lunar: LunarScenery;
  effects: readonly Effect[];
  particles: ParticleEffects;
  selected: Charge | null;
  ghost: { target: 'baron' | Charge | null; point: Point; valid: boolean } | null;
  tutorialTarget: Point | null;
  launchVector: Point;
  ride: RidePose | null;
  horseDeparture: HorseDeparture | null;
}

interface LunarScenery {
  hits: 0 | 1 | 2;
  crackAngle: number;
  crackAge: number;
  splitAge: number;
}

const rewardSprites: Record<RewardType, GameSprite> = {
  'powder-charge': 'reward-powder-charge', dynamite: 'reward-dynamite', 'powder-barrel': 'reward-powder-barrel',
  'heavy-charge': 'reward-heavy-charge', 'royal-bomb': 'reward-royal-bomb', wig: 'reward-wig',
  mortar: 'reward-mortar-blueprint', cannon: 'reward-cannon-blueprint',
};

export function project(camera: Camera, point: Point): Point {
  return { x: camera.width / 2 + (point.x - camera.x) * camera.zoom, y: camera.height / 2 - (point.y - camera.y) * camera.zoom };
}

export function unproject(camera: Camera, point: Point): Point {
  return { x: camera.x + (point.x - camera.width / 2) / camera.zoom, y: camera.y - (point.y - camera.height / 2) / camera.zoom };
}

export function badge(name: UiSprite, height = 24): HTMLSpanElement {
  return atlasIcon(name, ui.frames[name], ui.size, uiUrl, height);
}

export function inventoryArt(name: GameSprite): HTMLSpanElement {
  return atlasIcon(name, game.frames[name], game.size, gameUrl, 36);
}

function atlasIcon(
  name: string, frame: { x: number; y: number; width: number; height: number },
  size: readonly number[], url: string, height: number,
): HTMLSpanElement {
  const icon = document.createElement('span');
  icon.dataset.sprite = name;
  icon.className = 'sprite';
  icon.setAttribute('aria-hidden', 'true');
  const scale = height / frame.height;
  icon.style.width = `${frame.width * scale}px`;
  icon.style.height = `${height}px`;
  icon.style.backgroundImage = `url("${url}")`;
  icon.style.backgroundSize = `${size[0]! * scale}px ${size[1]! * scale}px`;
  icon.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
  return icon;
}

const cloudFragments = [
  { sprite: 'cloud-puff-medium', x: 29, y: 38, drift: -13, spin: -1.5, fall: 7 },
  { sprite: 'cloud-puff-large', x: 78, y: 29, drift: 2, spin: 0.8, fall: 5 },
  { sprite: 'cloud-puff-small', x: 128, y: 39, drift: 16, spin: 1.9, fall: 9 },
] as const;

function paintCloudFragments(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, hit: CloudHit, time: number): void {
  const age = time - hit.time;
  const duration = 2.65;
  if (age >= duration) return;
  const { cloud } = hit;
  const scale = cloud.scale * view.zoom;
  ctx.globalAlpha = cloud.opacity * (1 - (age / duration) ** 1.6);
  for (const fragment of cloudFragments) {
    const point = project(view, {
      x: cloud.x + fragment.x * cloud.scale + (hit.drift + fragment.drift) * age,
      y: cloud.y - fragment.y * cloud.scale - 3 * age - fragment.fall * age ** 2,
    });
    const { width, height } = game.frames[fragment.sprite];
    if (!inView(view, point, Math.hypot(width, height) * scale / 2)) continue;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(fragment.spin * age);
    drawSprite(ctx, atlas, fragment.sprite, -width * scale / 2, -height * scale / 2, scale);
    ctx.restore();
  }
}

function background(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, scene: Scene): void {
  const high = clamp(view.y / 2560, 0, 1);
  ctx.fillStyle = `rgb(${Math.round(7 + high * 24)},${Math.round(158 - high * 108)},${Math.round(235 - high * 106)})`;
  ctx.fillRect(0, 0, view.width, view.height);
  const min = unproject(view, { x: 0, y: view.height });
  const max = unproject(view, { x: view.width, y: 0 });
  for (const cloud of cloudsIn(min, max, scene.targetTime)) {
    if (scene.cloudHits?.has(cloud.id)) continue;
    const p = project(view, cloud);
    ctx.globalAlpha = cloud.opacity;
    drawSprite(ctx, atlas, 'cloud', p.x, p.y, cloud.scale * view.zoom);
  }
  for (const hit of scene.cloudHits?.values() ?? []) paintCloudFragments(ctx, atlas, view, hit, scene.animationTime);
  ctx.globalAlpha = 1;

  paintLandscape(ctx, view);
}

const windmills = [
  { x: -77, y: 19, scale: 0.37, phase: 0.30 },
  { x: 254, y: 22, scale: 0.32, phase: 0.64 },
  { x: 610, y: 28, scale: 0.40, phase: 1.27 },
];

function inView(view: Camera, point: Point, margin: number): boolean {
  return point.x >= -margin && point.x <= view.width + margin && point.y >= -margin && point.y <= view.height + margin;
}

function paintLandmarks(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, now: number): void {
  const castle = project(view, { x: 165, y: 70 });
  if (inView(view, castle, 40 * view.zoom)) drawSprite(ctx, atlas, 'castle', castle.x, castle.y, view.zoom * 0.30);

  for (const mill of windmills) {
    const foot = project(view, mill);
    if (!inView(view, foot, 62 * view.zoom)) continue;
    const scale = view.zoom * mill.scale;
    drawSprite(ctx, atlas, 'windmill', foot.x - 41 * scale, foot.y - 112 * scale, scale);
    ctx.save();
    ctx.translate(foot.x, foot.y - 79 * scale);
    ctx.rotate(mill.phase + now * 0.00087);
    const sails = scale * 1.22;
    drawSprite(ctx, atlas, 'windmill-sails', -52 * sails, -52 * sails, sails);
    ctx.restore();
  }

  const foot = project(view, { x: 381, y: 22 });
  if (!inView(view, foot, 82 * view.zoom)) return;
  const tower = view.zoom * 0.78;
  drawSprite(ctx, atlas, 'belfry', foot.x - 39 * tower, foot.y - 92 * tower, tower);
  const horse = view.zoom * 0.49;
  ctx.save();
  ctx.translate(foot.x, foot.y - 86 * tower);
  ctx.rotate(Math.sin(now * 0.0019) * 0.09);
  drawSprite(ctx, atlas, 'belfry-horse', -6 * horse, -4 * horse, horse);
  ctx.restore();
}

function paintLunarRunner(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, point: Point, scale: number, surfaceAngle: number, now: number, dog: boolean,
): void {
  const stride = now * (dog ? 0.014 : 0.011);
  const bounce = Math.abs(Math.sin(stride)) * (dog ? 8 : 11) * scale;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.beginPath();
  ctx.ellipse(0, 0, (dog ? 27 : 21) * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#a3724340';
  ctx.fill();
  ctx.translate(0, -bounce);
  ctx.scale(Math.sin(surfaceAngle) > 0 ? -1 : 1, 1);
  ctx.rotate(Math.sin(stride) * (dog ? 0.055 : 0.12));
  if (dog) {
    const legs = Math.sin(stride) > 0 ? 'dog-legs-extended' : 'dog-legs-tucked';
    drawSprite(ctx, atlas, legs, -42 * scale, -28 * scale, scale);
    drawSprite(ctx, atlas, 'moon-dog', -54 * scale, -75 * scale, scale);
  } else drawSprite(ctx, atlas, 'moon-coat', -53 * scale, -96 * scale, scale);
  ctx.restore();
}

const moonFractures = [
  { delay: 0, width: 0.022, path: new Path2D('M.035 0 L-.15 -.04 -.26 .07 -.39 .015 -.51 .16 -.64 .11 -.77 .24 -.88 .20') },
  { delay: 94, width: 0.013, path: new Path2D('M-.15 -.04 L-.20 -.16 -.33 -.19 -.36 -.31 -.47 -.36') },
  { delay: 144, width: 0.014, path: new Path2D('M-.26 .07 L-.28 .20 -.40 .27 -.38 .39') },
  { delay: 248, width: 0.011, path: new Path2D('M-.51 .16 L-.55 .025 -.69 -.06 -.74 -.17') },
];

function paintMoonCrack(ctx: CanvasRenderingContext2D, center: Point, radius: number, angle: number, age: number): void {
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(radius, radius);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(-angle);
  ctx.translate(1, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#9c654d';
  for (const fracture of moonFractures) {
    const length = (age - fracture.delay) / 360;
    if (length <= 0) continue;
    ctx.lineWidth = fracture.width;
    ctx.setLineDash(length < 1.4 ? [length, 2] : []);
    ctx.stroke(fracture.path);
  }
  ctx.restore();
}

function paintMoonSurface(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, x: number, y: number, scale: number): void {
  drawSprite(ctx, atlas, 'moon', x - 82 * scale, y - 82 * scale, scale);
}

function paintCheeseHalf(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, center: Point, radius: number, side: -1 | 1, angle = 0,
): void {
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.rect(side < 0 ? -radius : 0, -radius, radius, 2 * radius);
  ctx.clip();
  const scale = radius / 78;
  paintMoonSurface(ctx, atlas, 0, 0, scale);
  drawSprite(ctx, atlas, 'moon-cut', -27 * scale, -82 * scale, scale);
  ctx.restore();
}

const splitDelay = 85;
const crumbs = [
  { y: -0.60, xSpeed: -0.42, ySpeed: -0.24, size: 0.059 },
  { y: -0.27, xSpeed: -0.96, ySpeed: -0.34, size: 0.037 },
  { y: 0.06, xSpeed: -0.37, ySpeed: 0.03, size: 0.047 },
  { y: 0.36, xSpeed: -0.87, ySpeed: -0.14, size: 0.069 },
  { y: 0.69, xSpeed: -0.61, ySpeed: 0.13, size: 0.040 },
];

function paintFallingCheese(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, center: Point, radius: number, time: number): void {
  ctx.save();
  ctx.globalAlpha *= clamp((2.9 - time) / 0.55, 0, 1);
  const half = { x: center.x - radius * time * 0.65, y: center.y + radius * time * time * 0.56 };
  if (inView(view, half, radius)) paintCheeseHalf(ctx, atlas, half, radius, -1, -time * (0.58 + time * 0.44));
  ctx.fillStyle = '#ffcf52';
  for (const crumb of crumbs) {
    const x = center.x + radius * time * crumb.xSpeed;
    const y = center.y + radius * (crumb.y + time * crumb.ySpeed + time * time * 0.76);
    const size = radius * crumb.size;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 3 + crumb.y);
    ctx.fillRect(-size / 2, -size / 2, size, size * 0.78);
    ctx.restore();
  }
  ctx.restore();
}

function paintMoon(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, now: number, scenery: LunarScenery): void {
  const center = project(view, moon);
  const radius = moon.radius * view.zoom;
  const splitting = Number.isFinite(scenery.splitAge);
  const fallTime = (scenery.splitAge - splitDelay) / 1000;
  const split = splitting && fallTime >= 0;
  if (split && fallTime < 2.9) paintFallingCheese(ctx, atlas, view, center, radius, fallTime);
  if (!inView(view, center, radius + 45 * view.zoom)) return;

  const axeAngle = -0.61;
  const axeScale = 0.49 * view.zoom;
  const axeInset = radius - 2.7 * view.zoom;
  // Anchor the curved cutting edge using its outward normal in the atlas.
  const bladeEdge = { x: 17, y: 67 };
  const bladeNormal = Math.atan2(-16, 22);
  ctx.save();
  ctx.translate(center.x + Math.cos(axeAngle) * axeInset, center.y + Math.sin(axeAngle) * axeInset);
  ctx.rotate(axeAngle - bladeNormal);
  drawSprite(ctx, atlas, 'moon-axe', -bladeEdge.x * axeScale, -bladeEdge.y * axeScale, axeScale);
  ctx.restore();

  // The disk covers the part of the blade embedded in the Moon.
  if (split) paintCheeseHalf(ctx, atlas, center, radius, 1);
  else {
    paintMoonSurface(ctx, atlas, center.x, center.y, radius / 78);
    if (scenery.hits === 1 || splitting) paintMoonCrack(ctx, center, radius, scenery.crackAngle, scenery.crackAge);
  }

  const coatAngle = now * 0.00096 + 0.4;
  const runners = [{ angle: coatAngle, dog: false }, { angle: coatAngle - 0.92, dog: true }];
  runners.sort((a, b) => Math.sin(a.angle) - Math.sin(b.angle));
  for (const { angle, dog } of runners) {
    const depth = Math.sin(angle);
    const across = split ? 0.46 + Math.cos(angle) * 0.28 : Math.cos(angle) * 0.68;
    const foot = { x: center.x + across * radius, y: center.y + (depth * 0.42 + 0.13) * radius };
    const scale = view.zoom * (dog ? 0.38 : 0.44) * (1 + 0.13 * depth);
    paintLunarRunner(ctx, atlas, foot, scale, angle, now, dog);
  }
}

function line(ctx: CanvasRenderingContext2D, view: Camera, points: readonly Point[], color: string, dashed: boolean): void {
  if (points.length < 2) return;
  ctx.beginPath();
  points.forEach((world, index) => {
    const p = project(view, world);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.lineWidth = dashed ? 3.5 : 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  if (dashed) ctx.setLineDash([1, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

const hareShelters = [
  { x: start.x - 88, scale: 0.50, facing: 1 },
  { x: start.x + 190, scale: 0.54, facing: -1 },
] as const;

const harePaws = [
  { x: 35, y: 40, back: true, hind: true, stride: 0 },
  { x: 51, y: 37, back: true, hind: true, stride: Math.PI },
  { x: 69, y: 41, back: true, hind: false, stride: 1 },
  { x: 85, y: 42, back: true, hind: false, stride: Math.PI + 1 },
  { x: 32, y: 65, back: false, hind: true, stride: 0 },
  { x: 49, y: 69, back: false, hind: true, stride: Math.PI },
  { x: 74, y: 69, back: false, hind: false, stride: 1 },
  { x: 92, y: 65, back: false, hind: false, stride: Math.PI + 1 },
];

function paintHare(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, now: number): void {
  const elapsed = now - 550;
  const interval = 8400;
  const passTime = elapsed % interval;
  const duration = 3300;
  if (elapsed < 0 || passTime >= duration) return;

  const progress = passTime / duration;
  const direction = Math.floor(elapsed / interval) % 2 === 0 ? 1 : -1;
  const from = hareShelters[direction > 0 ? 0 : 1].x;
  const to = hareShelters[direction > 0 ? 1 : 0].x;
  const x = from + progress * (to - from);
  const rollPosition = direction * (x - start.x);
  const roll = clamp((rollPosition + 31) / 62, 0, 1);
  const turn = clamp((rollPosition - 34) / 22, 0, 1);
  const back = Math.cos(Math.PI * turn);
  const tucked = Math.sin(Math.PI * roll);
  const stride = passTime / 1000 * Math.PI * 6.4;
  const point = project(view, { x, y: 17 + Math.abs(Math.sin(stride)) * 2.5 + 10 * tucked });
  const scale = view.zoom * 0.31;
  if (!inView(view, point, 90 * scale)) return;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.scale(scale * direction, scale);
  ctx.rotate(2 * Math.PI * roll);
  ctx.scale(1, back);
  for (const paw of harePaws) {
    const active = Math.max(0, paw.back ? -back : back);
    const swing = Math.sin(stride + paw.stride) * (0.18 + 0.46 * active) * (1 - 0.82 * tucked);
    const pawScale = 0.68 + 0.12 * active - 0.30 * tucked;
    ctx.save();
    ctx.translate(paw.x - 70, paw.y - 50);
    if (paw.back) ctx.scale(1, -1);
    ctx.rotate(swing + (paw.hind ? 0.22 : -0.12));
    drawSprite(ctx, atlas, paw.hind ? 'hare-hind-paw' : 'hare-front-paw', -8 * pawScale, -5 * pawScale, pawScale);
    ctx.restore();
  }
  drawSprite(ctx, atlas, 'hare-body', -70, -50, 1);
  ctx.restore();
}

function paintHareShelters(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera): void {
  const { width, height } = game.frames['hare-bush'];
  for (const shelter of hareShelters) {
    const foot = project(view, { x: shelter.x, y: -5 });
    const scale = view.zoom * shelter.scale;
    if (!inView(view, foot, height * scale)) continue;
    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.scale(shelter.facing, 1);
    drawSprite(ctx, atlas, 'hare-bush', -width * scale / 2, -height * scale, scale);
    ctx.restore();
  }
}

const horseSpriteScale = 0.45;

function horsePart(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera,
  sprite: 'horse-front' | 'horse-front-drinking' | 'horse-rear' | 'deer', anchor: number, point: Point, facing: number, pitch: number,
): void {
  const foot = project(view, point);
  const scale = view.zoom * horseSpriteScale;
  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.scale(facing, 1);
  ctx.rotate(pitch);
  drawSprite(ctx, atlas, sprite, -anchor * scale, -103 * scale, scale);
  ctx.restore();
}

function paintDrinkingWater(ctx: CanvasRenderingContext2D, view: Camera, now: number): void {
  const front = horsePastures.front;
  const muzzle = project(view, { x: front - 38, y: 2.1 });
  const ripple = (now % 800) / 800;
  ctx.save();
  ctx.translate(muzzle.x, muzzle.y);
  ctx.scale(view.zoom, view.zoom);
  ctx.globalAlpha = 0.78 * (1 - ripple);
  ctx.strokeStyle = '#e6fbff';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 2 + ripple * 8, 0.7 + ripple * 2.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const height = (103 - 60) * horseSpriteScale;
  const outlet = project(view, { x: front + 1, y: height });
  ctx.save();
  ctx.translate(outlet.x, outlet.y);
  ctx.scale(view.zoom, view.zoom);
  ctx.beginPath();
  ctx.ellipse(20, height, 7, 2.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#78d5e0';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(13, 1, 20, height);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#65c5de';
  ctx.lineWidth = 2.7;
  ctx.stroke();
  ctx.strokeStyle = '#d7f6ff';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.lineDashOffset = -now * 0.024;
  ctx.stroke();
  ctx.restore();
}

function paintPastures(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, scene: Scene): void {
  const pond = project(view, { x: horsePastures.front - 40, y: 2 });
  if (inView(view, pond, 34 * view.zoom)) {
    const scale = 0.52 * view.zoom;
    drawSprite(ctx, atlas, 'pasture-pond', pond.x - 58 * scale, pond.y - 19 * scale, scale);
  }
  if (scene.ride && !scene.ride.deer) return;

  const front = horsePastureAt('front', scene.horseDeparture, scene.now);
  if (inView(view, project(view, { x: front.x, y: front.bounce }), 55 * view.zoom)) {
    horsePart(ctx, atlas, view, front.settled ? 'horse-front-drinking' : 'horse-front', 20, { x: front.x, y: front.bounce }, front.facing, front.pitch);
    if (front.settled) paintDrinkingWater(ctx, view, scene.now);
  }
  const rear = horsePastureAt('rear', scene.horseDeparture, scene.now);
  if (inView(view, project(view, { x: rear.x, y: rear.bounce }), 52 * view.zoom)) {
    const pitch = rear.settled ? Math.sin(scene.now * 0.0024) * 0.033 : rear.pitch;
    horsePart(ctx, atlas, view, 'horse-rear', 99, { x: rear.x, y: rear.bounce }, rear.facing, pitch);
  }
}

function returning(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, ride: RidePose): void {
  const { position, direction, spread, bounce, stride, frontTurn, opacity, deer } = ride;
  ctx.globalAlpha = opacity;
  const pitch = Math.sin(stride) * bounce * 0.021;
  if (deer) {
    horsePart(ctx, atlas, view, 'deer', 68, { x: position.x + direction * spread, y: bounce }, direction * frontTurn, pitch);
  } else {
    const offset = (spread + 1.5) * direction;
    horsePart(ctx, atlas, view, 'horse-rear', 99, { x: position.x - offset, y: bounce }, direction, -pitch);
    horsePart(ctx, atlas, view, 'horse-front', 20, { x: position.x + offset, y: bounce }, direction * frontTurn, pitch);
  }
  ctx.globalAlpha = 1;
}

function duckFall(hit: DuckHit, time: number): { position: Point; tumble: number; opacity: number } {
  const initialSpeed = 5;
  const acceleration = 12;
  const ramp = 1.5;
  const maxSpeed = initialSpeed + acceleration * ramp;
  const rampDrop = (initialSpeed + acceleration * ramp / 2) * ramp;
  const ground = 5;
  const height = Math.max(0, hit.position.y - ground);
  const landing = height > rampDrop ? ramp + (height - rampDrop) / maxSpeed
    : (Math.sqrt(initialSpeed ** 2 + 2 * acceleration * height) - initialSpeed) / acceleration;
  const age = Math.max(0, time - hit.time);
  const falling = Math.min(age, landing);
  const accelerating = Math.min(falling, ramp);
  const drop = (initialSpeed + acceleration * accelerating / 2) * accelerating + (falling - accelerating) * maxSpeed;
  return {
    position: {
      x: hit.position.x + hit.direction * (9 * (1 - Math.exp(-falling)) + 3 * Math.sin(falling * 3)),
      y: Math.max(ground, hit.position.y - drop),
    },
    tumble: hit.direction * (falling * 2.4 + Math.sin(falling * 7) * 0.16),
    opacity: clamp(1 - (age - landing - 0.6) / 0.8, 0, 1),
  };
}

function drawCharge(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, charge: Charge, selected: boolean): void {
  const p = project(view, charge);
  const size = Math.max(view.zoom * 0.225, 0.085);
  if (selected) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9 * view.zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#fff5df88';
    ctx.fill();
    ctx.strokeStyle = '#371945';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  drawSprite(ctx, atlas, charge.type, p.x - 36 * size, p.y - 41 * size, size);
}

function preparation(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, scene: Scene): void {
  const corner = project(view, { x: zone.left, y: zone.top });
  ctx.fillStyle = '#fff5df18';
  ctx.strokeStyle = '#fff5dfc9';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.roundRect(corner.x, corner.y, (zone.right - zone.left) * view.zoom, (zone.top - zone.bottom) * view.zoom, 9);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  if (scene.tutorialTarget) {
    const target = project(view, scene.tutorialTarget);
    ctx.save();
    ctx.beginPath();
    ctx.arc(target.x, target.y, Math.max(12, 8 * view.zoom), 0, Math.PI * 2);
    ctx.fillStyle = '#ffd51a55';
    ctx.fill();
    ctx.strokeStyle = '#ffd51a';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff5df';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const { setup, selected, ghost, launchVector } = scene;
  if (setup.launcher !== 'none') {
    const p = project(view, setup.baron);
    const scale = view.zoom * 0.29;
    if (setup.launcher === 'cannon') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(radians(36 - setup.cannonAngle));
      drawSprite(ctx, atlas, 'cannon', -100 * scale, -23 * scale, scale);
      ctx.restore();
    } else drawSprite(ctx, atlas, 'mortar', p.x - 54 * scale, p.y - 22 * scale, scale);
  }

  for (const item of setup.charges) {
    if (item !== ghost?.target) drawCharge(ctx, atlas, view, item, item === selected);
  }
  if (Math.hypot(launchVector.x, launchVector.y) > 1) {
    const p = project(view, setup.baron);
    const rotation = Math.atan2(-launchVector.y, launchVector.x);
    const scale = view.zoom * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.76;
    ctx.translate(p.x + 19 * view.zoom * Math.cos(rotation), p.y + 19 * view.zoom * Math.sin(rotation));
    ctx.rotate(rotation);
    drawSprite(ctx, atlas, 'aim-arrow', 0, -28 * scale, scale);
    ctx.restore();
  }
  if (ghost) {
    const p = project(view, ghost.point);
    if (ghost.target === 'baron') {
      ctx.globalAlpha = 0.62;
      paintBaron(ctx, atlas, p, view.zoom, scene.now, scene.baron);
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10 * view.zoom, 0, 2 * Math.PI);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ghost.valid ? '#fff5df' : '#ff625f';
    ctx.stroke();
  }
}

export function paint(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, view: Camera, scene: Scene): void {
  background(ctx, atlas, view, scene);
  paintLandmarks(ctx, atlas, view, scene.now);
  paintMoon(ctx, atlas, view, scene.now, scene.lunar);

  line(ctx, view, scene.lastPath, '#fff5dfbd', true);
  line(ctx, view, scene.currentPath, '#ffe579ba', false);
  const pad = project(view, { x: -44, y: 23 });
  drawSprite(ctx, atlas, 'launch-pad', pad.x, pad.y, 0.40 * view.zoom);
  paintHare(ctx, atlas, view, scene.now);
  paintHareShelters(ctx, atlas, view);

  for (const reward of scene.visibleRewards.values()) {
    const point = project(view, rewardAt(reward, scene.targetTime));
    const k = 0.33 * view.zoom;
    drawSprite(ctx, atlas, rewardSprites[reward.type], point.x - 45 * k, point.y - 134 * k, k);
  }

  for (let i = 0; i < ducks.length; i++) {
    const hit = scene.duckHits?.get(i);
    const fall = hit ? duckFall(hit, scene.animationTime) : null;
    if (fall?.opacity === 0) continue;
    const point = project(view, fall?.position ?? duckAt(i, scene.targetTime));
    if (point.x < -80 || point.x > view.width + 80 || point.y < -80 || point.y > view.height + 80) continue;
    const size = 0.235 * view.zoom;
    const left = hit ? hit.direction === -1 : Math.cos(ducks[i]!.phase + scene.targetTime * ducks[i]!.speed) < 0;
    ctx.save();
    ctx.translate(point.x, point.y);
    if (fall) {
      ctx.globalAlpha = fall.opacity;
      ctx.rotate(fall.tumble);
    }
    if (left) ctx.scale(-1, 1);
    const sprite = Math.floor((fall ? scene.animationTime : scene.targetTime) * 6 + i) % 2 ? 'duck-up' : 'duck-down';
    drawSprite(ctx, atlas, sprite, -56 * size, -66 * size, size);
    ctx.restore();
  }

  paintPastures(ctx, atlas, view, scene);
  if (scene.mode === 'prepare') preparation(ctx, atlas, view, scene);
  for (const effect of scene.effects) {
    const age = (scene.now - effect.since) / effect.duration;
    if (age >= 1) continue;
    const p = project(view, effect.point);
    const frame = game.frames[effect.sprite];
    const size = effect.size * (0.68 + age * 0.50) * view.zoom / frame.width;
    ctx.globalAlpha = 1 - age * age;
    drawSprite(ctx, atlas, effect.sprite, p.x - frame.width * size / 2, p.y - frame.height * size / 2, size);
    ctx.globalAlpha = 1;
  }
  scene.particles.paint(ctx, view, scene.now);
  if (scene.ride) returning(ctx, atlas, view, scene.ride);
  const hero = project(view, scene.position);
  if (inView(view, hero, 64 * view.zoom)) paintBaron(ctx, atlas, hero, view.zoom, scene.now, scene.baron);
}

const mapMargin = 8;
const groundStrip = 14;
const minimapStart = { x: start.x, y: map.bottom };

function minimapPoint(width: number, height: number, point: Point): Point {
  const horizontal = clamp((point.x - map.left) / (map.right - map.left), 0, 1);
  // Allocate more display space to low altitudes, where the first crates sit.
  const altitude = Math.sqrt(clamp((point.y - map.bottom) / (map.top - map.bottom), 0, 1));
  const ground = height - groundStrip;
  return { x: mapMargin + (width - mapMargin * 2) * horizontal, y: ground - (ground - mapMargin) * altitude };
}

export function fromMinimap(width: number, height: number, p: Point, targets: Pick<Scene, 'position' | 'visibleRewards' | 'targetTime'>): Point {
  const crates = Array.from(targets.visibleRewards.values(), (reward) => rewardAt(reward, targets.targetTime));
  const markers = [minimapStart, moon, ...crates, targets.position];
  let closest: Point | undefined;
  let closestDistance = 4;
  for (const marker of markers) {
    const projected = minimapPoint(width, height, marker);
    const distance = Math.hypot(projected.x - p.x, projected.y - p.y);
    if (distance > closestDistance) continue;
    closest = marker;
    closestDistance = distance;
  }
  if (closest) return closest;

  const horizontal = clamp((p.x - mapMargin) / (width - mapMargin * 2), 0, 1);
  const ground = height - groundStrip;
  const altitude = clamp((ground - p.y) / (ground - mapMargin), 0, 1) ** 2;
  return { x: map.left + (map.right - map.left) * horizontal, y: map.bottom + (map.top - map.bottom) * altitude };
}

export function paintMinimap(ctx: CanvasRenderingContext2D, view: Camera, scene: Scene, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#9dd8bb';
  ctx.fillRect(0, height - groundStrip, width, groundStrip);
  ctx.fillStyle = '#519784';
  ctx.fillRect(0, height - groundStrip, width, 1);

  const bottomLeft = minimapPoint(width, height, unproject(view, { x: 0, y: view.height }));
  const topRight = minimapPoint(width, height, unproject(view, { x: view.width, y: 0 }));
  const frameWidth = topRight.x - bottomLeft.x;
  const frameHeight = bottomLeft.y - topRight.y;
  if (frameWidth > 0 && frameHeight > 0) {
    ctx.strokeStyle = '#37194591';
    ctx.fillStyle = '#fff5df46';
    ctx.lineWidth = 1;
    ctx.fillRect(bottomLeft.x, topRight.y, frameWidth, frameHeight);
    ctx.strokeRect(bottomLeft.x, topRight.y, frameWidth, frameHeight);
  }

  ctx.beginPath();
  for (let i = 0; i < ducks.length; i++) {
    if (scene.duckHits?.has(i)) continue;
    const { x, y } = minimapPoint(width, height, duckAt(i, scene.targetTime));
    ctx.moveTo(x - 1.45, y);
    ctx.lineTo(x - 0.45, y + 0.8);
    ctx.lineTo(x + 1.45, y - 0.85);
  }
  ctx.strokeStyle = '#38635fbb';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  function marker(point: Point, color: string, size: number, diamond = false): void {
    const { x, y } = minimapPoint(width, height, point);
    ctx.beginPath();
    if (diamond) {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
    } else ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#371945';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  marker(minimapStart, '#ff625f', 2.8, true);
  marker(moon, scene.lunar.hits === 2 ? '#ffa32a' : '#ffd51a', 4.3);
  for (const reward of scene.visibleRewards.values()) {
    marker(rewardAt(reward, scene.targetTime), reward.color, 2.1, reward.type === 'mortar' || reward.type === 'cannon');
  }
  marker(scene.position, '#fff5df', 2.8);
}
