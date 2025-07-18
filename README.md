# Astro Uploader

A uploader for uploading the Astro generated files through the S3 API.

## Installation

```bash
# Use npm
npm install -D astro-uploader

# Use pnpm
pnpm add -D astro-uploader

# Use yarn
yarn add -D astro-uploader
```

```ts
// astro.config.ts
import process from 'node:process'
import { uploader } from 'astro-uploader'
import { defineConfig } from 'astro/config'
import { loadEnv } from 'vite'

const {
  UPLOAD_ASSETS,
  S3_ENDPOINT,
  S3_BUCKET,
  S3_ACCESS_KEY,
  S3_SECRET_ACCESS_KEY,
} = loadEnv(process.env.NODE_ENV!, process.cwd(), '')

export default defineConfig({
  integrations: [
    uploader({
      enable: UPLOAD_ASSETS !== 'false',
      paths: ['images', 'assets'],
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      accessKey: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    }),
  ],
})
```

## Options

See the [types.ts](src/types.ts) file on how to config this plugin.
