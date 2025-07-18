import type { _Object } from '@aws-sdk/client-s3'
import type { AwsCredentialIdentity } from '@smithy/types'
import type { AstroIntegration, AstroIntegrationLogger } from 'astro'
import type { Options } from '@/types'
import { readFile, rm, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { HeadBucketCommand, ListObjectsV2Command, NoSuchBucket, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import mime from 'mime'
import { normalizePath } from 'vite'
import { walk } from '@/walk'

async function createClient({
  region,
  endpoint,
  accessKey,
  secretAccessKey,
  bucket,
  logger,
}: {
  region?: string
  endpoint?: string
  accessKey?: string
  secretAccessKey?: string
  bucket: string
  logger: AstroIntegrationLogger
}): Promise<S3Client> {
  const credentials: AwsCredentialIdentity | undefined = accessKey !== undefined && secretAccessKey !== undefined
    ? {
        accessKeyId: accessKey!,
        secretAccessKey: secretAccessKey!,
      }
    : undefined
  if (credentials === undefined) {
    logger.warn('No credentials is provided. If you are using the IAM role, you can ignore this warning.')
  }

  if (region === undefined && endpoint === undefined) {
    throw new Error(`Either 'region' or 'endpoint' should be provided for connecting to S3.`)
  }

  const client = new S3Client({
    // The S3 official client requires an auto region for some 3rd party compatible OSS service.
    region: region === undefined || region.trim() === '' ? 'auto' : region,
    endpoint,
    credentials,
    useGlobalEndpoint: endpoint !== undefined && endpoint !== '',
  })

  logger.info('Try to verify the S3 credentials and network connection.')

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  }
  catch (err) {
    // If the bucket is not existed.
    if (err instanceof NoSuchBucket) {
      logger.error(
        `The bucket ${bucket} isn't existed${region !== undefined ? ` on the region: '${region}'` : ''}${endpoint !== undefined ? ` on the endpoint: '${endpoint}'` : ''}`,
      )
    }
    else {
      logger.error(JSON.stringify(err))
    }
    throw err
  }

  return client
}

async function uploadFiles({
  client,
  bucket,
  bucketRoot,
  paths,
  logger,
}: {
  client: S3Client
  bucket: string
  bucketRoot: string
  paths: {
    rootPath: string
    filePath: string
    recursive: boolean
    keep: boolean
    override: boolean
  }[]
  logger: AstroIntegrationLogger
}): Promise<void> {
  for (const { rootPath, filePath, recursive, keep, override } of paths) {
    await walk(rootPath, filePath, { recursive }, async (relative, files) => {
      // Upload all the files if the override option is enabled.
      if (override) {
        const results = files.map(file => ({ sourcePath: file.path, targetPath: normalizePath(join(bucketRoot, relative, file.name)) }))
        await Promise.all(results.map(async (result) => {
          logger.info(`Start to upload file: ${result.targetPath}`)
          const contentType = mime.getType(result.targetPath)
          const putCmd = new PutObjectCommand({
            Bucket: bucket,
            Key: result.targetPath,
            Body: await readFile(result.sourcePath),
            ContentType: contentType === null ? undefined : contentType,
          })
          await client.send(putCmd)
        }))
      }
      // Use ListObjectsV2 command for finding all the files.
      // See https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
      else {
        const prefix = normalizePath(join(bucketRoot, relative))
        const listCommand = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: files.length > 1000 ? files.length : 1000 })
        const response = await client.send(listCommand)
        const objects: Map<string, _Object> = response.Contents === undefined
          ? new Map()
          : new Map(response.Contents.filter(o => o.Key !== undefined).map(o => [o.Key, o]))

        // Find the files to upload.
        await Promise.all(files.filter(async (file) => {
          const object = objects.get(file.name)
          if (object !== undefined) {
            const meta = await stat(file.path)
            if (meta.size === object.Size) {
              return false
            }
          }
          return true
        })
          .map(async (file) => {
            const targetPath = normalizePath(join(bucketRoot, relative, file.name))
            logger.info(`Start to upload file: ${targetPath}`)
            const contentType = mime.getType(targetPath)
            const putCmd = new PutObjectCommand({
              Bucket: bucket,
              Key: targetPath,
              Body: await readFile(file.path),
              ContentType: contentType === null ? undefined : contentType,
            })
            await client.send(putCmd)
          }))
      }

      // Start to delete the files, in this method. We may not delete the directory.
      if (!keep) {
        await Promise.all(files.map(file => unlink(file.path)))
      }
    })

    // Try to delete the uploaded files.
    if (!keep) {
      try {
        // Given this is a dangerous operation. We do not allowed the user to use ".." directory.
        await rm(resolve(join(rootPath, filePath)), { recursive: true, force: true })
      }
      catch (err) {
        logger.error(`Failed to remove the ${filePath}.`)
        console.error(err)
      }
    }
  }
}

export default function uploader(options: Options): AstroIntegration {
  return {
    name: 'S3 Uploader',
    hooks: {
      'astro:build:done': async ({ dir, logger }: { dir: URL, logger: AstroIntegrationLogger }) => {
        if (options.enable === false) {
          logger.info('Skip uploading the build assets to S3 storage.')
          return
        }

        const { paths, region, endpoint, bucket, root, accessKey, secretAccessKey } = options
        const client = await createClient({ region, endpoint, bucket, accessKey, secretAccessKey, logger })
        const uploadPaths = paths.map((path) => {
          if (typeof path === 'string') {
            if (path.startsWith('..')) {
              throw new Error(`It's not allowed to upload the parent directories. Only child directories.`)
            }
            return {
              rootPath: dir.pathname,
              filePath: path,
              recursive: true,
              keep: false,
              override: false,
            }
          }
          else {
            if (path.path.startsWith('..')) {
              throw new Error(`It's not allowed to upload the parent directories. Only child directories.`)
            }
            return {
              rootPath: dir.pathname,
              filePath: path.path,
              recursive: path.recursive !== false,
              keep: path.keep === true,
              override: path.override === true,
            }
          }
        })

        logger.info(`Start to upload files to S3 [or S3 compatible] bucket ${bucket}.`)
        await uploadFiles({ client, bucket, bucketRoot: root === undefined ? '' : root, paths: uploadPaths, logger })
      },
    },
  }
}
