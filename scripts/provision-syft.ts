/**
 * Provision the pinned, checksum-verified Syft CLI into the app data dir so the
 * "generate SBOM from binary/image" feature works without a manual install.
 *
 * Usage: npm run provision:syft
 *
 * Downloads the pinned Syft release (see SYFT_VERSION in syftProvision.ts),
 * verifies its sha256 against the release checksums, and extracts the binary to
 * <DATA_DIR>/tools/syft-<version>/. resolveSyftPath() then finds it automatically.
 */

import { provisionSyft, SYFT_VERSION } from '../server/services/syftProvision.js'

async function main(): Promise<void> {
  process.stdout.write(`Provisioning Syft ${SYFT_VERSION}...\n`)
  const binaryPath = await provisionSyft()
  process.stdout.write(`Syft provisioned at: ${binaryPath}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`Failed to provision Syft: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
