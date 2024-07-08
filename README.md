# Astro Uploader

A uploader for uploading the Astro generated files through the S3 API.
This uploader is based on the [Apache OpenDAL™](https://github.com/apache/opendal). If you have any issues in uploading, it could be the issues in OpenDAL, remember to upgrade the OpenDAL to the latest version.

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

### Vite Dependency Optimization

If you have issues like '' in using this tool. Remember to change your Astro configuration for add the code shown below.

```ts
export default defineConfig({
  vite: {
    // Add this for avoiding the needless import optimize in Vite.
    optimizeDeps: { exclude: ['opendal'] },
  },
});
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
  // All the methods in https://docs.rs/opendal/latest/opendal/services/struct.S3.html#implementations can be treated as an extra option.
  extraOptions?: Record<string, string>
};
```
