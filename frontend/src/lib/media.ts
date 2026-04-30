import type { Bee } from '@ethersphere/bee-js'
import type { Hex, SwarmRef } from './types'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

export type MediaKind = 'image' | 'video' | 'file'

export interface UploadResult {
  ref: SwarmRef
  kind: MediaKind
  mime: string
  size: number
  name: string
  w?: number
  h?: number
  durationMs?: number
}

export class MediaSizeError extends Error {
  constructor(public readonly size: number, public readonly cap: number = MAX_UPLOAD_BYTES) {
    super(`file is ${size} bytes; cap is ${cap}`)
    this.name = 'MediaSizeError'
  }
}

export function classifyMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}

export interface UploadOptions {
  /** Encrypt at rest on Swarm. Reference itself becomes the capability. Default: true. */
  encrypt?: boolean
  /** Optional progress callback (0..1). */
  onProgress?: (frac: number) => void
}

/** Upload a single file to Swarm and return a reference + metadata. */
export async function uploadMedia(
  bee: Bee,
  batchId: string,
  file: File,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) throw new MediaSizeError(file.size)

  const encrypt = opts.encrypt ?? true
  const kind = classifyMime(file.type)

  const dims = kind === 'image' ? await readImageDimensions(file).catch(() => undefined) : undefined
  const duration = kind === 'video' ? await readVideoDuration(file).catch(() => undefined) : undefined

  const { reference } = await bee.uploadFile(batchId, file, file.name, {
    contentType: file.type,
    encrypt,
  })
  const ref = (reference.toString().startsWith('0x') ? reference.toString() : `0x${reference.toString()}`) as Hex

  // Best-effort progress tick.
  opts.onProgress?.(1)

  return {
    ref,
    kind,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    name: file.name,
    w: dims?.w,
    h: dims?.h,
    durationMs: duration,
  }
}

/**
 * Resolves a Swarm reference to a blob URL. Memoized for the lifetime of the
 * page so re-renders don't refetch. The bee node already caches the chunks
 * on disk, so this is purely about saving a localhost round-trip + re-render
 * jank, not about persistence.
 */
export class MediaResolver {
  private cache = new Map<string, Promise<string>>()

  constructor(private readonly bee: Bee) {}

  resolve(ref: SwarmRef): Promise<string> {
    const key = ref.toLowerCase()
    const hit = this.cache.get(key)
    if (hit) return hit

    const promise = (async () => {
      const file = await this.bee.downloadFile(ref.startsWith('0x') ? ref.slice(2) : ref)
      const bytes = file.data.toUint8Array()
      const mime = file.contentType ?? 'application/octet-stream'
      const blob = new Blob([new Uint8Array(bytes)], { type: mime })
      return URL.createObjectURL(blob)
    })()
    this.cache.set(key, promise)
    return promise
  }

  /** Drop every cached blob URL. Call on logout / page unload. */
  dispose(): void {
    for (const p of this.cache.values()) {
      p.then(url => URL.revokeObjectURL(url)).catch(() => {})
    }
    this.cache.clear()
  }
}

// ---- helpers ----------------------------------------------------------------

function readImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const out = { w: img.naturalWidth, h: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(out)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image load failed'))
    }
    img.src = url
  })
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      const ms = Math.round(v.duration * 1000)
      URL.revokeObjectURL(url)
      resolve(ms)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('video load failed'))
    }
    v.src = url
  })
}
