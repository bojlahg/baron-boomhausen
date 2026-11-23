import { ZZFX } from 'zzfx';
import score from 'virtual:baron-score';
import type { AudioChannel, MusicNote, MusicVoice, SoundCue } from './audio-types';

// ZzFX parameters: volume, randomness, frequency, attack, sustain, release, shape, curve, slide, ...
const patches: Record<SoundCue, number[][]> = {
  place: [[0.20, 0, 390, 0, 0.014, 0.055, 1, 1.4, -2]],
  // A soft attack and a low-pass filter keep the shot bass-heavy.
  launch: [[0.34, 0.012, 86, 0.014, 0.07, 0.38, 1, 1.5, -0.12, -0.02,
    0, 0, 0, 0.075, 0, 0, 0, 0.58, 0.045, 0, -175]],
  reward: [[0.19, 0, 660, 0.014, 0.05, 0.19, 0], [0.17, 0, 990, 0.012, 0.04, 0.23, 0]],
  duck: [[0.25, 0.035, 340, 0.009, 0.07, 0.13, 2, 2.1, -4.5, 0, -95, 0.05, 0, 0.11]],
  cloud: [[0.24, 0, 730, 0.01, 0.04, 0.25, 4, 2.4, -1.8]],
  wig: [[0.24, 0, 240, 0.01, 0.10, 0.27, 1, 1.6, 5, 0.16]],
  landing: [[0.24, 0.012, 115, 0.014, 0.02, 0.16, 1, 1.4, -0.42,
    0, 0, 0, 0, 0, 0, 0, 0, 0.48, 0.03, 0, -135]],
  horse: [[0.23, 0, 98, 0.014, 0.08, 0.21, 2, 2, 1.1, -0.06, -32, 0.05, 0, 0.55]],
  deer: [[0.16, 0, 784, 0.01, 0.03, 0.12, 1], [0.14, 0, 622, 0.01, 0.06, 0.20, 1]],
  record: [[0.19, 0, 523, 0.013, 0.05, 0.17, 1], [0.17, 0, 659, 0.013, 0.05, 0.18, 1], [0.18, 0, 784, 0.014, 0.07, 0.25, 1]],
  moon: [[0.21, 0, 523, 0.012, 0.07, 0.20, 1], [0.21, 0, 659, 0.012, 0.07, 0.22, 1],
    [0.21, 0, 784, 0.012, 0.10, 0.30, 1], [0.21, 0, 1047, 0.018, 0.17, 0.42, 1]],
};

const voices: Record<MusicVoice, { wave: OscillatorType; gain: number; length: number }> = {
  lead: { wave: 'triangle', gain: 0.080, length: 0.90 },
  bass: { wave: 'sine', gain: 0.084, length: 0.60 },
  pluck: { wave: 'triangle', gain: 0.039, length: 0.58 },
};

export function createPlayback(context: AudioContext) {
  // Use the context unlocked by the input handler for both the music and ZzFX buffers.
  void ZZFX.audioContext.close().catch(() => {});
  const output = context.createGain();
  output.connect(context.destination);
  const channels = { music: context.createGain(), effects: context.createGain() };
  channels.music.connect(output);
  channels.effects.connect(output);
  const sources = new Set<AudioScheduledSourceNode>();
  const buffers = new Map<SoundCue, AudioBuffer[]>();
  const lastCue = new Map<SoundCue, number>();
  let timer: number | undefined;
  let loopStart = 0;
  let nextNote = 0;
  let whistleBuffer: AudioBuffer | undefined;
  let whistle: { source: AudioBufferSourceNode; gain: GainNode } | undefined;

  function sampleBuffer(samples: ArrayLike<number>): AudioBuffer {
    const buffer = context.createBuffer(1, samples.length, ZZFX.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  function startSource(source: AudioScheduledSourceNode, at: number, tail?: GainNode): void {
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      tail?.disconnect();
    };
    source.start(at);
  }

  function playNote(note: MusicNote, at: number): void {
    const voice = voices[note.voice];
    const synth = context.createOscillator();
    const envelope = context.createGain();
    const end = at + note.length * voice.length;
    synth.type = voice.wave;
    synth.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(voice.gain, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    synth.connect(envelope);
    envelope.connect(channels.music);
    startSource(synth, at, envelope);
    synth.stop(end);
  }

  function scheduleMusic(): void {
    const now = context.currentTime;
    if (now >= loopStart + score.duration) {
      loopStart += Math.floor((now - loopStart) / score.duration) * score.duration;
      nextNote = 0;
    }
    let note = score.notes[nextNote]!;
    while (loopStart + note.at < now + 0.16) {
      const at = loopStart + note.at;
      if (at >= now - 0.05) playNote(note, Math.max(now, at));
      nextNote++;
      if (nextNote === score.notes.length) {
        nextNote = 0;
        loopStart += score.duration;
      }
      note = score.notes[nextNote]!;
    }
  }

  function setFlightSpeed(speed: number | null): void {
    const now = context.currentTime;
    if (speed === null) {
      if (whistle) {
        whistle.gain.gain.setTargetAtTime(0, now, 0.035);
        whistle.source.stop(now + 0.18);
        whistle = undefined;
      }
      return;
    }
    const intensity = Math.min(1, speed / 170);
    const rate = 0.78 + 0.67 * intensity;
    if (!whistle) {
      if (!whistleBuffer) {
        // The sustain slice contains 49 full cycles, so the loop has no click.
        const signal = ZZFX.buildSamples(1, 0, 490, 0.004, 0.12, 0.01, 1, 1.2);
        const offset = Math.round(ZZFX.sampleRate * 0.01);
        const length = Math.round(ZZFX.sampleRate * 0.1);
        whistleBuffer = sampleBuffer(signal.slice(offset, offset + length));
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = whistleBuffer;
      source.loop = true;
      source.playbackRate.value = rate;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(channels.effects);
      startSource(source, now, gain);
      whistle = { source, gain };
    }
    whistle.source.playbackRate.setTargetAtTime(rate, now, 0.06);
    whistle.gain.gain.setTargetAtTime(0.0375 * Math.sqrt(intensity), now, 0.07);
  }

  function stopSounds(): void {
    whistle = undefined;
    for (const source of sources) source.stop();
    sources.clear();
    lastCue.clear();
  }

  return {
    setFlightSpeed,
    stopSounds,
    setVolume(channel: AudioChannel, volume: number) {
      channels[channel].gain.value = volume;
    },
    start() {
      if (timer !== undefined) return;
      output.gain.value = 1;
      nextNote = 0;
      loopStart = context.currentTime + 0.035;
      scheduleMusic();
      timer = window.setInterval(scheduleMusic, 45);
    },
    stop() {
      window.clearInterval(timer);
      timer = undefined;
      output.gain.value = 0;
      stopSounds();
    },
    play(cue: SoundCue) {
      const now = context.currentTime;
      if (now - (lastCue.get(cue) ?? -Infinity) < 0.07) return;
      lastCue.set(cue, now);
      let samples = buffers.get(cue);
      if (!samples) {
        samples = patches[cue].map((parameters) => sampleBuffer(ZZFX.buildSamples(...parameters)));
        buffers.set(cue, samples);
      }
      const delay = cue === 'record' ? 0.2 : 0;
      samples.forEach((buffer, index) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(channels.effects);
        startSource(source, now + delay + index * 0.09);
      });
    },
  };
}
