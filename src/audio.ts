import type { createPlayback } from './audio-playback';
import type { AudioChannel, SoundCue } from './audio-types';

const mutedKey = 'baron-boomhausen:muted';
const volumeKey = 'baron-boomhausen:volume:v1';

export function gameAudio() {
  let muted = false;
  const volumes: Record<AudioChannel, number> = { music: 0.25, effects: 0.5 };
  try {
    muted = localStorage.getItem(mutedKey) === '1';
    const saved = JSON.parse(localStorage.getItem(volumeKey) ?? 'null') as Partial<typeof volumes> | null;
    for (const channel of ['music', 'effects'] as const) {
      const value = saved?.[channel];
      if (typeof value === 'number' && Number.isFinite(value)) volumes[channel] = Math.max(0, Math.min(1, value));
    }
  } catch { /* Storage is optional. */ }
  let context: AudioContext | undefined;
  let playback: ReturnType<typeof createPlayback> | undefined;
  let loading = false;
  const pending: { cue: SoundCue; at: number }[] = [];

  function startPlayback(): void {
    if (muted || context?.state !== 'running' || !playback) return;
    playback.start();
    for (const { cue, at } of pending.splice(0)) {
      if (volumes.effects > 0 && performance.now() - at <= 500) playback.play(cue);
    }
  }

  function activate(): void {
    if (muted || typeof AudioContext === 'undefined') return;
    try { context ??= new AudioContext(); } catch { return; }
    if (context.state !== 'running') void context.resume().then(startPlayback).catch(() => {});
    if (!loading && !playback) {
      const audioContext = context;
      loading = true;
      void import('./audio-playback').then(({ createPlayback: create }) => {
        playback = create(audioContext);
        playback.setVolume('music', volumes.music);
        playback.setVolume('effects', volumes.effects);
        startPlayback();
      }).catch(() => {
        pending.length = 0;
      }).finally(() => { loading = false; });
    }
    startPlayback();
  }

  function onInput(event: Event): void {
    if (event.isTrusted && !(event.target instanceof Element && event.target.closest('#sound-toggle'))) activate();
  }
  document.addEventListener('pointerup', onInput, true);
  document.addEventListener('keydown', onInput, true);
  document.addEventListener('click', onInput, true);

  return {
    get muted() { return muted; },
    volume(channel: AudioChannel) { return volumes[channel]; },
    setFlightSpeed(speed: number | null) {
      playback?.setFlightSpeed(!muted && context?.state === 'running' && volumes.effects > 0 ? speed : null);
    },
    setVolume(channel: AudioChannel, volume: number) {
      volumes[channel] = volume;
      playback?.setVolume(channel, volume);
      try { localStorage.setItem(volumeKey, JSON.stringify(volumes)); } catch { /* Playback still works. */ }
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(mutedKey, muted ? '1' : '0'); } catch { /* Playback still works. */ }
      if (muted) {
        playback?.stop();
        pending.length = 0;
      } else activate();
    },
    play(cue: SoundCue) {
      if (muted || !context || volumes.effects === 0) return;
      if (playback && context.state === 'running') playback.play(cue);
      else {
        if (pending.length >= 8) pending.shift();
        pending.push({ cue, at: performance.now() });
      }
    },
  };
}
