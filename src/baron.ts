import { drawSprite } from './sprites';
import { ballRadius, clamp } from './world';
import type { Point } from './world';

export interface BaronMotion {
  facing: -1 | 1;
  verticalSpeed: number;
  launchAge: number;
  wigAge: number;
  landingAge: number;
  moonAge: number;
  hop: number;
  mounted: number;
  stride: number;
}

const smile = new Path2D('M10-114 Q23-113 33-119 Q33-104 24-102 Q16-101 10-114 Z');
const teeth = new Path2D('M13-113 L30-116 Q27-108 19-110 Z');
const happyEyes = new Path2D('M-5-139 Q1-148 7-140 M14-139 Q18-146 23-139');
const closedEyes = new Path2D('M-5-140 Q1-135 7-140 M14-140 Q19-136 23-140');
const worriedBrows = new Path2D('M-6-146 Q-1-151 6-147 M14-147 Q20-151 24-145');
const star = new Path2D('M0-10 L3-3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3-3 Z');
const neck = { x: -10, y: -105 };
const curl = { x: -30, y: -143 };

function ease(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function pivot(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.translate(-x, -y);
}

function face(ctx: CanvasRenderingContext2D, expression: 'smile' | 'squint' | 'worried', blink: boolean): void {
  ctx.fillStyle = ctx.strokeStyle = '#371945';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  if (expression === 'worried') {
    ctx.stroke(worriedBrows);
    for (const x of [1, 18]) {
      ctx.fillStyle = '#fff5df';
      ctx.beginPath();
      ctx.ellipse(x, -139, 6, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#371945';
      ctx.beginPath();
      ctx.arc(x + 2, -136.5, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(22, -108, 6.5, 5.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.stroke(blink || expression === 'squint' ? closedEyes : happyEyes);
  ctx.fill(smile);
  ctx.fillStyle = '#fff5df';
  ctx.fill(teeth);
}

function arm(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement,
  shoulder: Point, elbow: Point, wrist: Point, far = false,
): void {
  const angle = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = far ? '#581655' : '#8e2185';
  ctx.lineWidth = far ? 18 : 23;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.stroke();
  ctx.translate(wrist.x, wrist.y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#fff5df';
  ctx.lineCap = 'butt';
  ctx.lineWidth = far ? 14 : 18;
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(-4, 0);
  ctx.stroke();
  if (far) ctx.scale(0.81, 0.81);
  drawSprite(ctx, atlas, 'baron-hand', -19, -17, 1);
}

export function paintBaron(
  ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, screen: Point, zoom: number, now: number, motion: BaronMotion,
): void {
  const { facing, verticalSpeed, launchAge, wigAge, landingAge, moonAge, hop, mounted, stride } = motion;
  const scale = zoom * ballRadius / 57;
  const breath = Math.sin(now * 0.0041);
  const bounce = Math.sin(stride) * mounted;
  const recoil = 1 - ease(launchAge / 360);
  const fall = ease(-verticalSpeed / 48);
  const squash = 1 - ease(landingAge / 315);
  const shake = Math.sin(Math.min(landingAge, 520) * 0.035) * (1 - ease(landingAge / 540));
  const reach = ease(wigAge / 85) * (1 - ease((wigAge - 310) / 225));
  const pull = ease((wigAge - 75) / 105) * (1 - ease((wigAge - 295) / 225));
  const cheer = ease(moonAge / 150) * (1 - ease((moonAge - 425) / 480));
  const headAngle = -0.033 * breath + 0.15 * fall - 0.14 * recoil + 0.13 * shake - 0.15 * pull;
  const headLift = -17 * pull;
  const torsoAngle = 0.024 * breath - 0.24 * recoil + 0.23 * fall + 0.18 * squash + 0.10 * mounted + 0.042 * bounce + 0.19 * hop;

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.scale(facing * scale, scale);
  if (mounted < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - mounted;
    ctx.translate(0, 11 * squash);
    ctx.scale(1 + 0.18 * squash - 0.3 * mounted, 1 - 0.19 * squash - 0.3 * mounted);
    drawSprite(ctx, atlas, 'cannonball', -62, -62, 1);
    ctx.restore();
  }
  ctx.translate(0, 2.1 * breath + 17 * squash - 10 * pull + 73 * mounted + 2.5 * bounce - 10 * hop);
  pivot(ctx, -17, -44, torsoAngle);

  ctx.save();
  pivot(ctx, -16, -62, 0.080 * Math.sin(now * 0.011) + 0.29 * recoil + 0.26 * fall + 0.23 * mounted);
  drawSprite(ctx, atlas, 'baron-tails', -108, -78, 1);
  ctx.restore();
  ctx.save();
  pivot(ctx, 20, -41, -0.19 * recoil + 0.23 * fall + 0.39 * mounted - 0.11 * bounce - 0.36 * hop);
  drawSprite(ctx, atlas, 'baron-far-leg', 8, -52, 1);
  ctx.restore();
  ctx.save();
  arm(ctx, atlas, { x: 0, y: -87 }, { x: 27 + 6 * fall, y: -65 }, { x: 43 + 11 * fall, y: -47 - 15 * fall - 7 * mounted }, true);
  ctx.restore();
  ctx.save();
  pivot(ctx, -23, -41, 0.17 * recoil - 0.19 * fall - 0.46 * mounted + 0.09 * bounce + 0.28 * hop);
  drawSprite(ctx, atlas, 'baron-near-leg', -60, -53, 1);
  ctx.restore();
  drawSprite(ctx, atlas, 'baron-coat', -40, -115, 1);

  ctx.save();
  ctx.translate(0, headLift);
  pivot(ctx, neck.x, neck.y, headAngle);
  drawSprite(ctx, atlas, 'baron-head', -54, -164, 1);
  const expression = recoil + squash > 0.37 ? 'squint' : fall > 0.18 && reach < 0.42 ? 'worried' : 'smile';
  face(ctx, expression, now % 3250 < 105);
  ctx.translate(-57 * reach + 3 * shake, -76 * reach + 8 * squash);
  pivot(ctx, -25, -152, -0.28 * recoil - 0.60 * reach + 0.12 * fall + 0.09 * bounce + 0.1 * shake);
  drawSprite(ctx, atlas, 'baron-hat', -116, -209, 1);
  ctx.restore();

  const dx = curl.x - neck.x;
  const dy = curl.y - neck.y;
  const pin = {
    x: neck.x + dx * Math.cos(headAngle) - dy * Math.sin(headAngle),
    y: neck.y + dx * Math.sin(headAngle) + dy * Math.cos(headAngle) + headLift,
  };
  const grip = { x: pin.x + 18 * pull, y: pin.y - 37 * pull };
  if (pull > 0) {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pin.x + 5, pin.y + 7);
    ctx.quadraticCurveTo(pin.x + 9, pin.y - 10, grip.x, grip.y);
    ctx.strokeStyle = '#dcb587';
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.strokeStyle = '#fff5df';
    ctx.lineWidth = 9;
    ctx.stroke();
  }
  const wrist = { x: 29 + 18 * fall + 13 * mounted + 17 * cheer, y: -46 - 26 * fall - 12 * mounted - 87 * cheer + 2 * bounce };
  const elbow = { x: -9 + 8 * fall, y: -59 - 9 * cheer + 4 * bounce };
  ctx.save();
  arm(ctx, atlas, { x: -20, y: -86 },
    { x: elbow.x + (-69 - elbow.x) * reach, y: elbow.y + (-108 - elbow.y) * reach },
    { x: wrist.x + (grip.x - wrist.x) * reach, y: wrist.y + (grip.y - wrist.y) * reach });
  ctx.restore();

  if (landingAge > 90 && landingAge < 600) {
    const phase = (landingAge - 90) / 510;
    ctx.globalAlpha *= Math.min(1, phase * 8) * (1 - phase);
    ctx.fillStyle = '#ffd51a';
    for (const offset of [0, Math.PI]) {
      const angle = phase * 5 + offset;
      ctx.save();
      ctx.translate(-17 + 66 * Math.cos(angle), -193 + 17 * Math.sin(angle));
      ctx.rotate(angle);
      ctx.fill(star);
      ctx.restore();
    }
  }
  ctx.restore();
}
