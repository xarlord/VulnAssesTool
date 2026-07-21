/**
 * SBOM Generation Routes (/api/sbom)
 *
 * Generates a CycloneDX SBOM from an uploaded binary/archive or a container
 * image reference via Syft, and returns the CycloneDX JSON. The client feeds
 * that JSON into the existing SBOM-import path (parseCycloneDX), so there is no
 * new parsing on the server.
 */

import { Router } from 'express'
import multer from 'multer'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Request, Response, NextFunction } from 'express'
import { SyftService, SyftError } from '../services/SyftService.js'
import type { SyftSource } from '../services/SyftService.js'
import { AndroidImageService, AndroidImageError, isAndroidImageDir } from '../services/AndroidImageService.js'
import { broadcast } from '../websocket.js'

const router = Router()

// Uploaded artifacts can be large binaries; cap to avoid unbounded disk use.
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

const uploadDir = path.join(os.tmpdir(), 'vat-sbom-uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({ dest: uploadDir, limits: { fileSize: MAX_UPLOAD_BYTES } })

/** Wrap multer so its errors become the house `{ success:false, error }` shape. */
function uploadArtifact(req: Request, res: Response, next: NextFunction): void {
  upload.single('artifact')(req, res, (err: unknown) => {
    if (err) {
      const isSize = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      res.json({
        success: false,
        error: isSize
          ? `Uploaded file exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit.`
          : err instanceof Error
            ? err.message
            : 'Upload failed',
      })
      return
    }
    next()
  })
}

router.get('/engine-status', async (_req, res) => {
  const status = await new SyftService().getEngineStatus()
  res.json({ success: true, ...status })
})

router.post('/generate', uploadArtifact, async (req, res) => {
  const file = req.file
  const imageRef = typeof req.body?.imageRef === 'string' ? req.body.imageRef.trim() : ''
  const localPath = typeof req.body?.localPath === 'string' ? req.body.localPath.trim() : ''

  try {
    let source: SyftSource
    if (file) {
      source = { kind: 'file', value: file.path }
    } else if (localPath) {
      // Scan a file or directory already on the host by path — no upload, so
      // multi-GB local artifacts (e.g. Android prebuilt images) are viable.
      let stat: fs.Stats
      try {
        stat = fs.statSync(localPath)
      } catch {
        res.json({ success: false, error: `Path not found on server: ${localPath}` })
        return
      }
      // An Android prebuilt-image directory (super.img/boot.img) can't be read
      // by Syft directly; unpack the sparse/super/EROFS partitions first.
      if (stat.isDirectory() && isAndroidImageDir(localPath)) {
        broadcast('sbom-generate-progress', { phase: 'starting', message: 'Detected Android image — unpacking…' })
        const android = new AndroidImageService()
        const cyclonedxJson = await android.generateSbom(localPath, (message) => {
          broadcast('sbom-generate-progress', { phase: 'android-unpack', message })
        })
        res.json({
          success: true,
          cyclonedxJson,
          meta: {
            engine: 'syft+android-unpack',
            source: 'android-image',
            imageRef: undefined,
            filename: undefined,
            byteLength: cyclonedxJson.length,
          },
        })
        return
      }
      source = { kind: stat.isDirectory() ? 'dir' : 'file', value: localPath }
    } else if (imageRef) {
      source = { kind: 'image', value: imageRef }
    } else {
      res.json({ success: false, error: 'Provide an artifact file, a local path, or an image reference.' })
      return
    }

    broadcast('sbom-generate-progress', { phase: 'starting', message: 'Starting Syft...' })

    const syft = new SyftService()
    const cyclonedxJson = await syft.generateSbom(source, (phase, message) => {
      broadcast('sbom-generate-progress', { phase, message })
    })

    res.json({
      success: true,
      cyclonedxJson,
      meta: {
        engine: 'syft',
        source: file ? 'file' : 'image',
        filename: file?.originalname,
        imageRef: imageRef || undefined,
        byteLength: cyclonedxJson.length,
      },
    })
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate SBOM',
      code: error instanceof SyftError || error instanceof AndroidImageError ? error.code : undefined,
    })
  } finally {
    if (file) {
      fs.promises.rm(file.path, { force: true }).catch(() => {
        // best-effort temp cleanup
      })
    }
  }
})

export { router as sbomRoutes }
