# Container Image Scanning

VulnAssesTool can scan Docker and Podman container images, extract their software packages, and import them as project components for vulnerability assessment.

## Prerequisites

- **Docker** or **Podman** must be installed and running on the host system
- The container runtime CLI must be accessible in the system `PATH`
- Sufficient disk space for pulling images and extracting layers

### Installing Docker

- **Windows**: [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
- **macOS**: [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- **Linux**: Follow the [Docker Engine installation guide](https://docs.docker.com/engine/install/)

### Installing Podman

- **Windows**: [Podman Desktop](https://podman.io/getting-started/installation)
- **macOS**: `brew install podman`
- **Linux**: `sudo dnf install podman` (Fedora) or `sudo apt install podman` (Ubuntu)

Verify installation:

```bash
docker version    # For Docker
podman version    # For Podman
```

## Usage

### Via UI

1. Open a project from the Dashboard
2. In the **SBOM Files** section, click **Scan Container**
3. Enter the image reference (see supported formats below)
4. Select **Docker** or **Podman** as the runtime
5. Click **Scan Image**
6. Wait for the scan to complete — progress is shown in real-time
7. Review the results: layer breakdown, package counts, package managers
8. Click **Add Packages to Project** to import discovered packages as components

### Via API (Programmatic)

```typescript
import { scanContainerImage, checkContainerRuntime } from '@/lib/services/container'

// Check if Docker is available
const runtimeInfo = await checkContainerRuntime('docker')
if (!runtimeInfo.available) {
  throw new Error('Docker is not available')
}

// Scan an image
const result = await scanContainerImage('alpine:latest', {
  runtime: 'docker',
  sbomOnly: true,
})

console.log(`Found ${result.packages.length} packages`)
for (const pkg of result.packages) {
  console.log(`  ${pkg.name} ${pkg.version} (${pkg.manager})`)
}
```

### Via IPC (Electron Renderer)

```typescript
// Full scan
const result = await window.electronAPI.container.scanImage({
  imageRef: 'nginx:1.21',
  runtime: 'docker',
})

if (result.success) {
  const { packages, layers, stats } = result.result!
  console.log(`Scanned ${stats.totalLayers} layers, found ${stats.uniquePackages} packages`)
}

// Just check runtime availability
const check = await window.electronAPI.container.checkRuntime('podman')
console.log(check.runtime?.available ? 'Podman is available' : 'Podman not found')

// Listen to progress
const cleanup = window.electronAPI.container.onScanProgress((progress) => {
  console.log(`[${progress.phase}] ${progress.message}`)
})
```

## Supported Image Reference Formats

| Format         | Example                               |
| -------------- | ------------------------------------- |
| Simple name    | `nginx`                               |
| Name with tag  | `nginx:1.21`                          |
| With registry  | `ghcr.io/org/image:v1`                |
| With digest    | `nginx@sha256:abc123...`              |
| Full reference | `registry.example.com/team/app:2.0.0` |

Default tag is `latest` if not specified. Default registry is `docker.io`.

## Package Detection

The scanner detects packages from three Linux package managers:

| Package Manager | Distribution         | Database Path           |
| --------------- | -------------------- | ----------------------- |
| **dpkg**        | Debian, Ubuntu       | `/var/lib/dpkg/status`  |
| **apk**         | Alpine               | `/lib/apk/db/installed` |
| **rpm**         | RHEL, Fedora, CentOS | `/var/lib/rpm/Packages` |

### How It Works

1. **Pull**: The image is pulled to local storage (skipped if already present)
2. **Export**: `docker save` exports the image as a tar archive
3. **Extract**: Layer tarballs are extracted to a temporary directory
4. **Scan**: Each layer is scanned for package database files
5. **Parse**: Package metadata (name, version, architecture) is extracted
6. **Consolidate**: Packages are deduplicated across layers (later layers take precedence)

### Generated Data

Each discovered package includes:

- `name` — Package name
- `version` — Package version
- `manager` — Package manager (`dpkg`, `apk`, or `rpm`)
- `architecture` — CPU architecture (e.g., `amd64`, `arm64`)
- `cpe` — CPE 2.3 URI (auto-generated)
- `purl` — Package URL (purl) specification
- `layerDigest` — SHA-256 digest of the source layer

## Architecture

```
┌─────────────────┐     IPC      ┌──────────────────┐     CLI      ┌─────────┐
│  React UI       │ ──────────> │  Electron Main   │ ──────────> │ Docker  │
│  (Renderer)     │ <────────── │  (ContainerService)│ <────────── │ Podman  │
│                 │             │                   │             │         │
│ ContainerScan   │             │ checkRuntime()    │             │ docker  │
│ Dialog          │             │ pullImage()       │             │ podman  │
│                 │             │ inspectImage()    │             │ commands│
│ containerScanner│             │ extractPackages() │             └─────────┘
│ (IPC-aware)     │             │ scanImage()       │
└─────────────────┘             └──────────────────┘
```

### Files

| File                                                      | Purpose                           |
| --------------------------------------------------------- | --------------------------------- |
| `electron/types/container.ts`                             | IPC channel definitions and types |
| `electron/services/ContainerService.ts`                   | Docker/Podman CLI execution       |
| `electron/main.ts`                                        | IPC handlers                      |
| `electron/preload.ts`                                     | API exposure to renderer          |
| `src/renderer/components/ContainerScanDialog.tsx`         | Scan dialog UI                    |
| `src/renderer/lib/services/container/containerScanner.ts` | Renderer-side scanner (uses IPC)  |

## Limitations

- **rpm packages**: Binary RPM databases cannot be parsed without the `rpm` CLI tool. RHEL/Fedora/CentOS images may show fewer detected packages.
- **Windows containers**: Only Linux containers are supported (dpkg, apk, rpm package managers).
- **Multi-arch images**: Specify the `platform` option to select the desired architecture.
- **Large images**: Images with many layers (100+) may take several minutes to scan.
- **Private registries**: Registry authentication is not yet supported in the UI. Images from private registries need to be pre-pulled via CLI.

## Troubleshooting

### "Docker is not installed or not in PATH"

- Ensure Docker Desktop (or Docker Engine) is installed and running
- On Windows, make sure Docker Desktop is running in the system tray
- Verify with `docker version` in a terminal

### "Podman is not installed or not in PATH"

- Install Podman following the instructions above
- On Linux, you may need to start the podman socket: `systemctl --user enable --now podman.socket`

### Scan returns 0 packages

- The image may use a package manager not yet supported (e.g., Nix, Guix)
- The image may be a minimal "scratch" image with no package database
- Check the layer breakdown in the scan results to see if layers were processed

### Image pull fails

- Check internet connectivity
- Verify the image reference is correct
- For private registries, pull the image manually first: `docker pull registry.example.com/image:tag`
