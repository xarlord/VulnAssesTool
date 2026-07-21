#!/usr/bin/env bash
#
# unpack-android-image.sh — turn an Android prebuilt-image directory into a
# CycloneDX SBOM, implementing the §1 "Android images" fallback from
# docs/sbom-cataloging-guidelines.md (Syft cannot read sparse/super/EROFS images,
# so we unpack to a directory first and scan `dir:`).
#
# Pipeline:  super.img (sparse) --simg2img--> super.raw --lpunpack--> partitions
#            --(EROFS fsck.erofs --extract | ext4 mount/debugfs)--> trees
#            --syft dir:--> CycloneDX (+ kernel version from boot.img as a component)
#
# Runs in a Linux environment (on Windows: WSL2). Self-provisions the tools it
# needs. Writes the CycloneDX JSON to stdout; all progress/logging goes to stderr
# so the caller can capture stdout as the SBOM.
#
# Usage: unpack-android-image.sh <android-image-dir> [work-dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_DIR="${1:-}"
WORK="${2:-$(mktemp -d -t vat-android-XXXXXX)}"
SYFT_VERSION="v1.44.0"

log() { echo "[unpack-android] $*" >&2; }
progress() { echo "PROGRESS:$*" >&2; } # parsed by the caller for UI updates

if [[ -z "$IMAGE_DIR" || ! -d "$IMAGE_DIR" ]]; then
  log "image directory not found: '$IMAGE_DIR'"
  exit 2
fi

cleanup() { [[ -n "${VAT_KEEP_WORK:-}" ]] || rm -rf "$WORK" 2>/dev/null || true; }
trap cleanup EXIT
mkdir -p "$WORK"

# --- provision tools (only what's missing) --------------------------------
ensure_apt() {
  local missing=()
  command -v simg2img >/dev/null 2>&1 || missing+=(android-sdk-libsparse-utils)
  command -v fsck.erofs >/dev/null 2>&1 || missing+=(erofs-utils)
  if ((${#missing[@]})); then
    progress "installing ${missing[*]}"
    log "installing apt packages: ${missing[*]}"
    export DEBIAN_FRONTEND=noninteractive
    sudo apt-get update -qq >&2
    sudo apt-get install -y -qq "${missing[@]}" >&2
  fi
}
ensure_syft() {
  if ! command -v syft >/dev/null 2>&1; then
    progress "installing syft ${SYFT_VERSION}"
    log "installing syft ${SYFT_VERSION}"
    curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin "$SYFT_VERSION" >&2
  fi
}
ensure_apt
ensure_syft

# --- locate + expand super.img -------------------------------------------
SUPER="$IMAGE_DIR/super.img"
if [[ ! -f "$SUPER" ]]; then
  log "no super.img in $IMAGE_DIR"
  exit 3
fi

progress "expanding super.img"
log "simg2img super.img -> super.raw.img"
# super.img may already be raw (not sparse); simg2img handles sparse, so only
# convert when the sparse magic (0x3aff26ed) is present, else use it directly.
magic=$(head -c4 "$SUPER" | od -An -tx1 | tr -d ' \n')
if [[ "$magic" == "3aff26ed" ]]; then
  simg2img "$SUPER" "$WORK/super.raw.img"
else
  ln -sf "$SUPER" "$WORK/super.raw.img"
fi

progress "reading dynamic partitions"
log "lpunpack super.raw.img"
mkdir -p "$WORK/parts"
python3 "$SCRIPT_DIR/lpunpack.py" "$WORK/super.raw.img" "$WORK/parts" >&2

# --- extract each partition filesystem to a tree --------------------------
mkdir -p "$WORK/tree"
for part in "$WORK"/parts/*.img; do
  [[ -e "$part" ]] || continue
  name="$(basename "$part" .img)"
  # strip A/B slot suffix so the tree reads cleanly (system_a -> system)
  clean="${name%_a}"
  dest="$WORK/tree/$clean"
  mkdir -p "$dest"
  erofs_magic=$(dd if="$part" bs=1 skip=1024 count=4 2>/dev/null | od -An -tx1 | tr -d ' \n')
  ext4_magic=$(dd if="$part" bs=1 skip=1080 count=2 2>/dev/null | od -An -tx1 | tr -d ' \n')
  if [[ "$erofs_magic" == "e2e1f5e0" ]]; then
    progress "extracting $clean (erofs)"
    fsck.erofs --extract="$dest" "$part" >&2 2>/dev/null || log "erofs extract failed for $clean"
  elif [[ "$ext4_magic" == "53ef" ]]; then
    progress "extracting $clean (ext4)"
    if ! mount -o loop,ro "$part" "$dest" 2>/dev/null; then
      # no loop device available — fall back to debugfs (no mount needed)
      debugfs -R "rdump / $dest" "$part" >&2 2>/dev/null || log "ext4 extract failed for $clean"
    fi
  else
    log "skipping $clean (unrecognized filesystem)"
    rmdir "$dest" 2>/dev/null || true
  fi
done

# --- catalog with syft ----------------------------------------------------
progress "cataloging with syft"
log "syft dir:$WORK/tree"
syft "dir:$WORK/tree" -o cyclonedx-json -q > "$WORK/syft.json" 2>/dev/null

# unmount any ext4 loop mounts before cleanup
for d in "$WORK"/tree/*; do mountpoint -q "$d" 2>/dev/null && umount "$d" 2>/dev/null || true; done

# --- optional cve-bin-tool layer (off by default) -------------------------
# cve-bin-tool is slow (~1s/file) and low-yield on stripped Android natives, so
# it is opt-in via VAT_ENABLE_CBT=1 (more useful on non-Android firmware).
CBT_ARG=()
if [[ -n "${VAT_ENABLE_CBT:-}" ]] && command -v cve-bin-tool >/dev/null 2>&1; then
  progress "cve-bin-tool signature scan (opt-in)"
  cve-bin-tool -q --sbom-output "$WORK/cbt.json" --sbom-type cyclonedx --sbom-format json "$WORK/tree" >&2 2>/dev/null || true
  [[ -s "$WORK/cbt.json" ]] && CBT_ARG=(--cbt "$WORK/cbt.json")
fi

# --- kernel version from boot.img ----------------------------------------
KVER=""
if [[ -f "$IMAGE_DIR/boot.img" ]]; then
  banner=$(strings -a "$IMAGE_DIR/boot.img" | grep -m1 "Linux version" || true)
  # "Linux version 6.12.23-android16-5-..." -> 6.12.23
  KVER=$(printf '%s' "$banner" | sed -n 's/^Linux version \([0-9][0-9.]*\).*/\1/p')
  [[ -n "$KVER" ]] && log "kernel version: $KVER"
fi

# --- finalize: exhaustive inventory + probes + merge -> stdout ------------
# Default output = versioned + known third-party libs; set VAT_FULL_INVENTORY=1
# for the exhaustive audit view (every framework/vendor .so included).
progress "cataloging (inventory + probes + merge)"
FULL_ARG=()
[[ -n "${VAT_FULL_INVENTORY:-}" ]] && FULL_ARG=(--full-inventory)
python3 "$SCRIPT_DIR/android-catalog.py" \
  --tree "$WORK/tree" --syft "$WORK/syft.json" "${CBT_ARG[@]}" --kernel "$KVER" "${FULL_ARG[@]}"
