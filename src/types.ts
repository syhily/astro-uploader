export interface Path {
  /**
   * The directory in the astro static build that you want to upload to S3.
   */
  path: string
  /**
   * Whether to upload the files that locates in the inner directory.
   */
  recursive?: boolean
  /**
   * Whether to keep the original files after uploading.
   */
  keep?: boolean
  /**
   * Whether to override the existing files on S3.
   * It will be override only when the content-length don't match the file size by default.
   */
  override?: boolean
}

export type Options
  = | { enable: false }
    | {
      /**
       * Enable the uploader
       */
      enable?: true
      /**
       * The directory in the astro static build that you want to upload to S3.
       * The string will be translated into:
       * {
       *   path: [string],
       *   recursive: true,
       *   keep: false,
       *   override: false
       * }
       */
      paths: Array<string | Path>
      /**
       * The S3 region, set it if you use AWS S3 service.
       */
      region?: string
      /**
       * The endpoint, set it if you use 3rd-party S3 service.
       */
      endpoint?: string
      /**
       * The name of the bucket.
       */
      bucket: string
      /**
       * The root directory in S3 service that you want to upload files.
       * The default values is '/'
       */
      root?: string
      /**
       * The access key.
       */
      accessKey: string
      /**
       * The access secret.
       */
      secretAccessKey: string
    }
