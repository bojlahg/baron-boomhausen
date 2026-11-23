import { game } from './assets/atlas-frames.json';

export type GameSprite = keyof typeof game.frames;

export function drawSprite(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, name: GameSprite, x: number, y: number, scale: number): void {
  const frame = game.frames[name];
  ctx.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, x, y, frame.width * scale, frame.height * scale);
}
