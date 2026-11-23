declare module '@strudel/core/pattern.mjs' {
  interface Pattern {
    queryArc(start: number, end: number): {
      value: number;
      whole: { begin: unknown };
      duration: unknown;
    }[];
  }
  export const silence: Pattern;
  export function sequence(...steps: (number | Pattern)[]): Pattern;
  export function slowcat(...patterns: Pattern[]): Pattern;
}

declare module 'zzfx' {
  export const ZZFX: {
    readonly audioContext: AudioContext;
    readonly sampleRate: number;
    buildSamples(...parameters: number[]): number[];
  };
}

declare module 'virtual:baron-score' {
  const score: import('./audio-types').MusicScore;
  export default score;
}
