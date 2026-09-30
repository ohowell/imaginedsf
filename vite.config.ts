import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { content } from './plugins/content/index.ts'

// GitHub Pages answers unknown paths with 404.html, so a copy of index.html
// lets deep links load the app.
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (index?.type !== 'asset') {
        return this.error('index.html is missing from the bundle')
      }
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: index.source,
      })
    },
  }
}

export default defineConfig({
  base: `${process.env.BASE_PATH?.replace(/\/+$/, '') ?? ''}/`,
  plugins: [react(), content(), spaFallback()],
  build: {
    // MapLibre alone is about a megabyte (280 kB compressed).
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        // Libraries change less often than the site, so they get files of
        // their own that stay cached across deploys.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
              name: 'maplibre',
              test: /node_modules[\\/](maplibre-gl|@maplibre)[\\/]/,
            },
          ],
        },
      },
    },
  },
})
