import type { Camera } from './render';
import { ballRadius } from './world';
import type { Point } from './world';

const shapes = {
  puff: new Path2D('M-1 .14 Q-1.1 -.34 -.63 -.49 Q-.57 -1 -.04 -.77 Q.48 -.93 .66 -.46 Q1.14 -.37 .98 .16 Q.98 .63 .43 .67 Q.03 .89 -.34 .67 Q-.89 .73 -1 .14 Z'),
  spark: new Path2D('M0 -1 L.24 -.24 1 0 .24 .24 0 1 -.24 .24 -1 0 -.24 -.24 Z'),
  confetti: new Path2D('M-.88 -.55 L.78 -.67 .86 .54 -.68 .66 Z'),
  feather: new Path2D('M-.96 .63 Q-.64 .26 -.36 .01 Q-.50 -.47 .15 -.76 Q.64 -.98 .98 -.69 Q.86 -.12 .45 .13 Q.18 .28 -.21 .22 Q-.58 .53 -.96 .63 Z'),
  streak: new Path2D('M-1.75 .02 Q-.82 -.31 .52 -.26 Q1.17 -.2 1.52 0 Q.94 .23 .35 .23 Q-.84 .25 -1.75 .02 Z'),
};

type Shape = keyof typeof shapes;

interface Spray {
  shape: Shape;
  count: number;
  size: number;
  speed: number;
  lift: number;
  gravity: number;
  life: number;
  opacity: number;
  colors: readonly string[];
}

const bursts = {
  place: [
    { shape: 'spark', count: 5, size: 2, speed: 19, lift: 11, gravity: 42, life: 0.32, opacity: 0.8, colors: ['#fff5df', '#ffd75c'] },
  ],
  launch: [
    { shape: 'puff', count: 12, size: 8, speed: 43, lift: 12, gravity: -12, life: 0.78, opacity: 0.59, colors: ['#fff1d0', '#f7cd9e', '#d9b2a4'] },
    { shape: 'spark', count: 16, size: 3, speed: 90, lift: 30, gravity: 144, life: 0.56, opacity: 1, colors: ['#ffec74', '#ffac47', '#ff7856', '#fff5df'] },
  ],
  reward: [
    { shape: 'confetti', count: 14, size: 2.8, speed: 62, lift: 26, gravity: 91, life: 0.8, opacity: 1, colors: ['#ff70aa', '#77e6b9', '#ffd51a', '#fff5df'] },
    { shape: 'spark', count: 7, size: 3.2, speed: 49, lift: 16, gravity: 50, life: 0.58, opacity: 0.96, colors: ['#ffd51a', '#fff5df'] },
  ],
  duck: [
    { shape: 'feather', count: 7, size: 4.1, speed: 24, lift: 16, gravity: 33, life: 0.98, opacity: 0.91, colors: ['#fff5df', '#fff5df', '#f8dbab'] },
  ],
  cloud: [
    { shape: 'puff', count: 9, size: 5.1, speed: 33, lift: 0, gravity: 24, life: 0.58, opacity: 0.45, colors: ['#fff5df', '#e2f5f3', '#c9e7ef'] },
  ],
  wig: [
    { shape: 'spark', count: 13, size: 3.1, speed: 45, lift: 33, gravity: 82, life: 0.70, opacity: 0.98, colors: ['#ffe36a', '#fff5df', '#ec84ca'] },
  ],
  landing: [
    { shape: 'puff', count: 15, size: 7.5, speed: 54, lift: 25, gravity: 16, life: 0.77, opacity: 0.55, colors: ['#ffe2a4', '#ffc984', '#fff5df'] },
    { shape: 'confetti', count: 8, size: 2.2, speed: 58, lift: 26, gravity: 105, life: 0.51, opacity: 0.84, colors: ['#fbc479', '#d9a674', '#ffe6ae'] },
  ],
  hoof: [
    { shape: 'puff', count: 3, size: 4.4, speed: 16, lift: 9, gravity: -2, life: 0.40, opacity: 0.48, colors: ['#ffe2a4', '#f8c78d'] },
  ],
  moon: [
    { shape: 'spark', count: 20, size: 3.4, speed: 83, lift: 5, gravity: 24, life: 0.83, opacity: 0.99, colors: ['#fff5df', '#ffe479', '#f4b9e9', '#a9dcff'] },
  ],
  cheese: [
    { shape: 'confetti', count: 23, size: 3.7, speed: 92, lift: 8, gravity: 70, life: 1.16, opacity: 0.99, colors: ['#ffba48', '#ffe682', '#ffcd49', '#fff5df'] },
  ],
} satisfies Record<string, readonly Spray[]>;

type Burst = keyof typeof bursts;

interface WaveStyle {
  size: number;
  height: number;
  life: number;
  color: string;
}

const waveStyles: Partial<Record<Burst, WaveStyle>> = {
  launch: { size: 50, height: 0.41, life: 0.48, color: '#ffe482' },
  reward: { size: 30, height: 1, life: 0.39, color: '#fff5df' },
  wig: { size: 35, height: 0.64, life: 0.41, color: '#ffe482' },
  landing: { size: 64, height: 0.18, life: 0.46, color: '#fff0c6' },
  moon: { size: 72, height: 1, life: 0.63, color: '#fff5df' },
  cheese: { size: 95, height: 1, life: 0.72, color: '#ffd75e' },
};

interface Particle extends Point {
  shape: Shape;
  color: string;
  since: number;
  life: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  angle: number;
  spin: number;
  opacity: number;
}

interface Wave extends WaveStyle, Point { since: number }

export class ParticleEffects {
  private readonly particles: Particle[] = [];
  private readonly waves: Wave[] = [];
  private nextWake = 0;
  private nextHoof = 0;

  constructor(private readonly density: number) {}

  clear(): void {
    this.particles.length = 0;
    this.waves.length = 0;
    this.nextWake = 0;
    this.nextHoof = 0;
  }

  burst(kind: Burst, point: Point, now: number, accent?: string): void {
    for (const spray of bursts[kind]) {
      const count = Math.max(1, Math.round(spray.count * this.density));
      const rotation = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const angle = rotation + (i + Math.random() * 0.6) * Math.PI * 2 / count;
        const speed = spray.speed * (0.35 + Math.random() * 0.65);
        const vx = Math.cos(angle) * speed;
        const color = accent && i % 3 === 0 ? accent : spray.colors[i % spray.colors.length]!;
        this.add({
          ...point, shape: spray.shape, color, since: now, life: spray.life * (0.62 + Math.random() * 0.48),
          vx, vy: Math.sin(angle) * speed * 0.64 + spray.lift, gravity: spray.gravity,
          size: spray.size * (0.57 + Math.random() * 0.80), angle,
          spin: (Math.random() - 0.5) * 9, opacity: spray.opacity,
        });
      }
    }
    const wave = waveStyles[kind];
    if (wave) {
      if (this.waves.length >= 12) this.waves.shift();
      this.waves.push({ ...point, ...wave, since: now });
    }
  }

  wake(point: Point, velocity: Point, now: number): void {
    if (now < this.nextWake) return;
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed < 22) return;
    this.nextWake = now + Math.max(46, 115 - speed * 0.33) / this.density;
    const x = velocity.x / speed;
    const y = velocity.y / speed;
    const side = (Math.random() - 0.5) * 11;
    const back = ballRadius + 5;
    this.add({
      x: point.x - x * back + y * side, y: point.y - y * back - x * side,
      shape: 'streak', color: '#fff3d9', since: now, life: 0.43,
      vx: -x * 17, vy: -y * 17, gravity: 1.5,
      size: Math.min(6, 2.8 + speed * 0.013), angle: Math.atan2(-y, x), spin: 0,
      opacity: Math.min(0.77, 0.39 + speed * 0.0015),
    });
  }

  hooves(point: Point, direction: -1 | 1, now: number): void {
    if (now < this.nextHoof) return;
    this.nextHoof = now + 105 / this.density;
    this.burst('hoof', { x: point.x - direction * 33, y: 2 }, now);
  }

  paint(ctx: CanvasRenderingContext2D, view: Camera, now: number): void {
    const { zoom, width, height } = view;
    const originX = width / 2 - view.x * zoom;
    const originY = height / 2 + view.y * zoom;
    ctx.save();
    let retained = 0;
    for (const wave of this.waves) {
      const phase = (now - wave.since) / (1000 * wave.life);
      if (phase >= 1) continue;
      this.waves[retained++] = wave;
      if (phase < 0) continue;
      const radius = zoom * wave.size * (1 - 0.83 * (1 - phase) ** 3);
      const x = originX + wave.x * zoom;
      const y = originY - wave.y * zoom;
      if (radius < 1 || x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) continue;
      ctx.globalAlpha = 0.70 * (1 - phase) ** 1.65;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = Math.max(0.8, zoom * (1.3 - phase));
      ctx.beginPath();
      ctx.ellipse(x, y, radius, wave.height * radius, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.waves.length = retained;

    retained = 0;
    for (const particle of this.particles) {
      const age = (now - particle.since) / 1000;
      const phase = age / particle.life;
      if (phase >= 1) continue;
      this.particles[retained++] = particle;
      if (phase < 0) continue;
      const smoke = particle.shape === 'puff';
      const size = particle.size * zoom * (smoke ? 0.65 + phase : 1 - phase * 0.4);
      const x = originX + (particle.x + particle.vx * age) * zoom;
      const y = originY - (particle.y + particle.vy * age - particle.gravity * age * age / 2) * zoom;
      const margin = size * 2;
      if (size < 0.35 || x + margin < 0 || x - margin > width || y + margin < 0 || y - margin > height) continue;
      ctx.save();
      ctx.globalAlpha = particle.opacity * (1 - phase) ** (smoke ? 1.5 : 0.75);
      ctx.fillStyle = particle.color;
      ctx.translate(x, y);
      ctx.rotate(particle.angle + particle.spin * age);
      ctx.scale(size, size);
      ctx.fill(shapes[particle.shape]);
      ctx.restore();
    }
    this.particles.length = retained;
    ctx.restore();
  }

  private add(particle: Particle): void {
    if (this.particles.length >= 160) this.particles.shift();
    this.particles.push(particle);
  }
}
