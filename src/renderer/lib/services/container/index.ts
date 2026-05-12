/**
 * Container Service Module
 *
 * Container image scanning for Docker and Podman.
 * Extracts SBOM from container layers and integrates with vulnerability scanning.
 *
 * @module services/container
 */

export {
  ContainerScanner,
  createContainerScanner,
  scanContainerImage,
  checkContainerRuntime,
  parseImageReference,
  type ContainerRuntime,
  type RegistryAuth,
  type ImageReference,
  type ContainerLayer,
  type LayerPackage,
  type ContainerScanOptions,
  type ContainerScanResult,
  type RuntimeInfo,
} from './containerScanner'
