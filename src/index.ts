import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import { z } from 'astro/zod';
import mime from 'mime';
import fs from 'node:fs';
import path from 'node:path';
import { Operator } from 'opendal';
import { rimrafSync } from 'rimraf';

type Path = {
  // The directory in the astro static build that you want to upload to S3.
  path: string;
  // Whether to upload the files that locates in the inner directory.
  recursive?: boolean;
  // Whether to keep the original files after uploading.
  keep?: boolean;
  // Whether to override the existing files on S3.
  // It will be override only when the content-length don't match the file size by default.
  override?: boolean;
};

type Options = {
  // Enable the uploader
  enable?: boolean;
  // The directory in the astro static build that you want to upload to S3.
  paths: Array<string | Path>;
  // Whether to upload the files that locates in the inner directory.
  recursive?: boolean;
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
  // The root directory in S3 service that you want to upload files.
  root?: string;
  // The access key id.
  accessKey: string;
  // The secret access key.
  secretAccessKey: string;
  // All the methods in https://docs.rs/opendal/latest/opendal/services/struct.S3.html#implementations can be treated as an extra option.
  extraOptions?: Record<string, string>;
};

const S3Options = z
  .object({
    enable: z.boolean().optional().default(true),
    paths: z
      .array(
        z.union([
          z.string(),
          z.object({
            path: z.string(),
            keep: z.boolean().optional(),
            recursive: z.boolean().optional(),
            override: z.boolean().optional(),
          }),
        ]),
      )
      .min(1),
    keep: z.boolean().optional().default(false),
    recursive: z.boolean().optional().default(true),
    override: z.boolean().optional().default(false),
    region: z.string().min(1).default('auto'),
    endpoint: z.string().url().optional(),
    bucket: z.string().min(1),
    root: z.string().default(''),
    accessKey: z.string().min(1),
    secretAccessKey: z.string().min(1),
    extraOptions: z.record(z.string(), z.string()).default({}),
  })
  .strict()
  .superRefine((opts, { addIssue }) => {
    if (opts.region === 'auto' && opts.endpoint === undefined) {
      addIssue({
        fatal: true,
        code: 'custom',
        message: 'either the region or the endpoint should be provided',
      });
    }
  });

const parseOptions = (opts: Options, logger: AstroIntegrationLogger) => {
  try {
    const {
      enable,
      paths,
      recursive,
      keep,
      override,
      region,
      endpoint,
      bucket,
      root,
      accessKey,
      secretAccessKey,
      extraOptions,
    } = S3Options.parse(opts);

    // Create opendal operator options.
    // The common configurations are listed here https://docs.rs/opendal/latest/opendal/services/struct.S3.html#configuration
    const options: Record<string, string> = {
      ...extraOptions,
      root: root,
      bucket: bucket,
      region: region,
      access_key_id: accessKey,
      secret_access_key: secretAccessKey,
    };
    if (endpoint !== undefined) {
      options.endpoint = endpoint;
    }

    const resolvedPaths = paths.map((path) =>
      typeof path === 'string'
        ? { path, recursive, keep, override }
        : {
            path: path.path,
            recursive: path.recursive === undefined ? recursive : path.recursive,
            keep: path.keep === undefined ? keep : path.keep,
            override: path.override === undefined ? override : path.override,
          },
    );

    return { options, paths: resolvedPaths, enable };
  } catch (err) {
    if (err instanceof z.ZodError) {
      logger.error(`Uploader options validation error, there are ${err.issues.length} errors:`);
      for (const issue of err.issues) {
        logger.error(issue.message);
      }
    }

    throw err;
  }
};

class Uploader {
  private operator: Operator;

  constructor(operator: Operator) {
    this.operator = operator;
  }

  async isExist(key: string, size: number, override: boolean): Promise<boolean> {
    try {
      const { contentLength } = await this.operator.stat(key);
      if ((contentLength !== null && contentLength !== BigInt(size)) || override) {
        await this.operator.delete(key);
        return false;
      }
      return true;
    } catch (err) {
      // Just ignore the error for now. If we find better solution for how to handle the opendal error.
      if (err instanceof Error) {
        const msg = err.toString();
        if (msg.includes('Error: NotFound')) {
          return false;
        }
      }
      throw err;
    }
  }

  async write(key: string, body: Buffer) {
    const contentType = mime.getType(key);
    await this.operator.write(key, body, { contentType: contentType === null ? undefined : contentType });
  }
}

export const uploader = (opts: Options): AstroIntegration => ({
  name: 'S3 Uploader',
  hooks: {
    'astro:build:done': async ({ dir, logger }: { dir: URL; logger: AstroIntegrationLogger }) => {
      const { options, paths, enable } = parseOptions(opts, logger);
      if (!enable) {
        logger.warn('Skip the astro uploader.');
        return;
      }

      logger.info('Try to verify the S3 credentials.');
      const operator = new Operator('s3', options);
      await operator.check();

      logger.info(`Start to upload static files in dir ${paths} to S3 compatible backend.`);
      const uploader = new Uploader(operator);
      for (const current of paths) {
        await uploadFile(uploader, logger, current, dir.pathname);
        if (!current.keep && current.recursive) {
          const resolvedPath = path.join(dir.pathname, current.path);
          logger.info(`Remove the path: ${resolvedPath}`);
          // Delete the whole path
          rimrafSync(resolvedPath);
        }
      }

      logger.info('Upload all the files successfully.');
    },
  },
});

// Change the windows path into the unix path.
const normalizePath = (current: string): string => {
  return current.includes(path.win32.sep) ? current.split(path.win32.sep).join(path.posix.sep) : current;
};

const uploadFile = async (
  uploader: Uploader,
  logger: AstroIntegrationLogger,
  current: {
    path: string;
    recursive: boolean;
    keep: boolean;
    override: boolean;
  },
  root: string,
) => {
  const filePath = current.path;
  const fileStats = fs.statSync(filePath);
  const isFile = !fileStats.isDirectory();
  const uploadAction = async (key: string) => {
    logger.info(`Start to upload file: ${key}`);
    const body = fs.readFileSync(filePath);
    await uploader.write(key, body);
  };

  if (isFile) {
    const key = normalizePath(path.join(root, current.path));
    if (await uploader.isExist(key, fileStats.size, current.override)) {
      logger.info(`${key} exists on backend, skip.`);
    } else {
      await uploadAction(key);
    }

    if (!current.keep && !current.recursive) {
      rimrafSync(current.path);
    }
  } else {
    // Reclusive upload files or only upload the first hierarchy of the files.
    for (const next of fs.readdirSync(filePath)) {
      if (next.startsWith('.')) {
        continue;
      }

      const nextFilePath = path.join(current.path, next);
      if (current.recursive || !fs.statSync(nextFilePath).isDirectory()) {
        await uploadFile(uploader, logger, { ...current, path: nextFilePath }, root);
      }
    }
  }
};
