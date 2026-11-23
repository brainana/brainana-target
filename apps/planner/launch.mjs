import { launch } from '@brainana/core-launcher/launch.mjs'
import { viewerManifestProvider } from '@brainana/brainana-data/manifest.mjs'
import { fileURLToPath } from 'node:url'

launch({
  manifestProvider: viewerManifestProvider,
  appLabel: 'BrainanaTarget',
  cacheApp: 'BrainanaTarget',
  distRoot: fileURLToPath(new URL('./dist/', import.meta.url)),
  preferredPort: 5183,
  runtimeMetadata: {
    demoDatasetRoot: fileURLToPath(new URL('../../datasets/demo_viewer/', import.meta.url)),
  },
}).catch((error) => {
  console.error('BrainanaTarget launch failed:', error)
  process.exitCode = 1
})
