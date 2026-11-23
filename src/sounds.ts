import './style.css';
import './sounds.css';
import type { createPlayback } from './audio-playback';
import type { SoundCue } from './audio-types';

const names: Record<SoundCue, string> = {
  place: 'Place Charge',
  launch: 'Launch',
  reward: 'Collect Reward',
  duck: 'Hit Duck',
  cloud: 'Break Cloud',
  wig: 'Wig Boost',
  landing: 'Landing',
  horse: 'Horse Return',
  deer: 'Deer Return',
  record: 'New Record',
  moon: 'Reach the Moon',
};

type Playback = ReturnType<typeof createPlayback>;
const list = document.querySelector<HTMLUListElement>('#sound-list')!;
const slider = document.querySelector<HTMLInputElement>('#preview-volume')!;
const level = document.querySelector<HTMLOutputElement>('#preview-level')!;
const status = document.querySelector<HTMLParagraphElement>('#preview-status')!;
let context: AudioContext | undefined;
let playback: Playback | undefined;
let loading: Promise<Playback> | undefined;
let previewId = 0;
let animationFrame = 0;

async function enableAudio(): Promise<Playback> {
  const audioContext = context ??= new AudioContext();
  const resume = audioContext.resume();
  loading ??= import('./audio-playback')
    .then((module) => playback = module.createPlayback(audioContext))
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  const [, audio] = await Promise.all([resume, loading]);
  return audio;
}

function stopPreview(): void {
  previewId++;
  cancelAnimationFrame(animationFrame);
  playback?.stopSounds();
}

async function preview(label: string, play: (audio: Playback) => void): Promise<void> {
  stopPreview();
  const id = previewId;
  try {
    const audio = await enableAudio();
    if (id !== previewId) return;
    audio.setVolume('effects', slider.valueAsNumber / 100);
    play(audio);
    status.textContent = `Last preview · ${label}`;
  } catch {
    if (id === previewId) status.textContent = 'Audio is unavailable. Try pressing Play again.';
  }
}

for (const [cue, name] of Object.entries(names) as [SoundCue, string][]) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  const icon = document.createElement('span');
  icon.className = 'sound-play';
  icon.textContent = '▶';
  icon.setAttribute('aria-hidden', 'true');
  button.type = 'button';
  button.className = 'sound-card';
  button.dataset.sound = cue;
  button.setAttribute('aria-label', `Play ${name}`);
  button.append(icon, name);
  button.addEventListener('click', () => void preview(name, (audio) => audio.play(cue)));
  item.append(button);
  list.append(item);
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-whistle]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.whistle;
    void preview(`Flight Whistle · ${button.textContent}`, (audio) => {
      const flyby = mode === 'flyby';
      const duration = flyby ? 2400 : 1400;
      const start = performance.now();
      function whistle(now: number): void {
        const progress = (now - start) / duration;
        if (progress >= 1) {
          audio.setFlightSpeed(null);
          return;
        }
        const speed = flyby ? 125 - 90 * Math.sin(Math.PI * progress) : mode === 'slow' ? 48 : 150;
        audio.setFlightSpeed(speed);
        animationFrame = requestAnimationFrame(whistle);
      }
      whistle(start);
    });
  });
}

slider.addEventListener('input', () => {
  level.value = `${slider.value}%`;
  slider.setAttribute('aria-valuetext', level.value);
  playback?.setVolume('effects', slider.valueAsNumber / 100);
});
document.querySelector('#stop-preview')!.addEventListener('click', () => {
  stopPreview();
  status.textContent = 'Stopped.';
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPreview(); });
