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
import { defineConfig } from 'astro/config'
import { uploader, type Options } from 'astro-uploader'

export default defineConfig({
  integrations: [
    uploader({
      paths: ['images', 'og', 'cats'],
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET as string,
      accessKey: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    }),
  ],
})
```

## Options

```ts
type Options = {
  // The directories that you want to upload to S3.
  paths: string[];
  // Whether to keep the original files after uploading.
  keep?: boolean;
  // Whether to override the existing files on S3.
  // It will be override only when the content-length don't match the file size by default.
  override?: boolean;
  // The S3 region, set it if you use AWS S3 service.
  region?: string;
  // The endpoint, set it if you use 3rd-party S3 service.
  endpoint?: string;
  // The name of the bucket.
  bucket: string;
  // The root directory you want to upload files.
  root?: string;
  // The access key id.
  accessKey: string;
  // The secret access key.
  secretAccessKey: string;
};
```
