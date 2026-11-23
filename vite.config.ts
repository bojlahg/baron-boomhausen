import { defineConfig } from 'vite';
import { buildScore } from './src/audio-score.ts';

const scoreModule = 'virtual:baron-score';

export default defineConfig(({ mode }) => {
  const release = mode === 'release';
  return {
    base: './',
    build: {
      outDir: release ? 'dist-release' : 'dist',
      rolldownOptions: { input: release ? ['index.html'] : ['index.html', 'sounds.html'] },
    },
    plugins: [{
      name: 'baron-music',
      resolveId(id) {
        if (id === scoreModule) return '\0' + scoreModule;
      },
      load(id) {
        if (id === '\0' + scoreModule) return `export default ${JSON.stringify(buildScore())}`;
      },
    }, release && {
      name: 'baron-release',
      transformIndexHtml(html) {
        return html.replace(/^[ \t]*<!-- dev-only -->[\s\S]*?<!-- \/dev-only -->\r?\n/gm, '');
      },
    }],
  };
});
