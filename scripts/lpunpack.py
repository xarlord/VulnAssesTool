#!/usr/bin/env python3
"""
Minimal, self-contained unpacker for Android "super" (dynamic partition) images.

Reads the AOSP liblp on-disk metadata (geometry + metadata header + partition/
extent tables) directly and writes each logical partition (system, vendor,
product, ...) out as its own image file. Stdlib-only, no external deps — used by
scripts/unpack-android-image.sh so the Android SBOM pipeline stays offline and
reproducible instead of pulling an unpinned lpunpack at runtime.

Layout (see AOSP system/core/fs_mgr/liblp/include/liblp/metadata_format.h):
  0      : 4096 reserved bytes
  4096   : primary geometry   (LP_METADATA_GEOMETRY_SIZE = 4096)
  8192   : backup geometry
  12288  : primary metadata slot 0  (header + tables)

Only LINEAR extents (target_type 0) carry data; sectors are always 512 bytes.

Usage: lpunpack.py <super.raw.img> <out_dir> [partition ...]
"""

import os
import struct
import sys

SECTOR_SIZE = 512
LP_PARTITION_RESERVED_BYTES = 4096
LP_METADATA_GEOMETRY_SIZE = 4096
GEOMETRY_MAGIC = 0x616C4467  # 'gDla'
HEADER_MAGIC = 0x414C5030  # '0PLA'
TARGET_TYPE_LINEAR = 0


class LpError(Exception):
    pass


def _read(fh, offset, size):
    fh.seek(offset)
    data = fh.read(size)
    if len(data) != size:
        raise LpError(f"short read at {offset} ({len(data)}/{size})")
    return data


def read_metadata(fh):
    # Geometry (primary at 4096). Validates this is a super image.
    geo = _read(fh, LP_PARTITION_RESERVED_BYTES, 52)
    (magic, _struct_size) = struct.unpack_from("<II", geo, 0)
    if magic != GEOMETRY_MAGIC:
        raise LpError("not an LP super image (bad geometry magic)")

    metadata_offset = LP_PARTITION_RESERVED_BYTES + LP_METADATA_GEOMETRY_SIZE * 2

    # Metadata header (fixed prefix through the 4 table descriptors).
    header = _read(fh, metadata_offset, 128)
    hmagic, _major, _minor, header_size = struct.unpack_from("<IHHI", header, 0)
    if hmagic != HEADER_MAGIC:
        raise LpError("bad metadata header magic")

    # Four table descriptors {offset, num_entries, entry_size} start at byte 80
    # (after magic, versions, header_size, header_checksum[32], tables_size,
    #  tables_checksum[32]).
    desc_base = 80
    descriptors = {}
    for i, name in enumerate(("partitions", "extents", "groups", "block_devices")):
        off, num, entry = struct.unpack_from("<III", header, desc_base + i * 12)
        descriptors[name] = (off, num, entry)

    tables_start = metadata_offset + header_size

    def table(name):
        off, num, entry = descriptors[name]
        base = tables_start + off
        return [_read(fh, base + i * entry, entry) for i in range(num)]

    partitions = []
    for raw in table("partitions"):
        name = raw[0:36].split(b"\x00", 1)[0].decode("utf-8", "replace")
        _attributes, first_extent, num_extents, _group = struct.unpack_from("<IIII", raw, 36)
        partitions.append((name, first_extent, num_extents))

    extents = []
    for raw in table("extents"):
        num_sectors, target_type, target_data, _source = struct.unpack_from("<QIQI", raw, 0)
        extents.append((num_sectors, target_type, target_data))

    return partitions, extents


def extract(super_path, out_dir, wanted):
    os.makedirs(out_dir, exist_ok=True)
    with open(super_path, "rb") as fh:
        partitions, extents = read_metadata(fh)
        written = []
        for name, first_extent, num_extents in partitions:
            if wanted and name not in wanted:
                continue
            # Skip inactive/empty slots (e.g. the *_b partitions of an A/B image
            # carry no extents) so we don't litter the output with 0-byte files.
            if num_extents == 0:
                continue
            out_path = os.path.join(out_dir, f"{name}.img")
            total = 0
            with open(out_path, "wb") as out:
                for idx in range(first_extent, first_extent + num_extents):
                    num_sectors, target_type, target_data = extents[idx]
                    length = num_sectors * SECTOR_SIZE
                    if target_type != TARGET_TYPE_LINEAR:
                        out.write(b"\x00" * length)  # ZERO extent
                        total += length
                        continue
                    fh.seek(target_data * SECTOR_SIZE)
                    remaining = length
                    while remaining > 0:
                        chunk = fh.read(min(remaining, 8 * 1024 * 1024))
                        if not chunk:
                            break
                        out.write(chunk)
                        remaining -= len(chunk)
                    total += length - remaining
            written.append((name, out_path, total))
            print(f"extracted {name} -> {out_path} ({total} bytes)")
        return written


def main(argv):
    if len(argv) < 3:
        print("usage: lpunpack.py <super.raw.img> <out_dir> [partition ...]", file=sys.stderr)
        return 2
    super_path, out_dir = argv[1], argv[2]
    wanted = set(argv[3:])
    try:
        written = extract(super_path, out_dir, wanted)
    except LpError as exc:
        print(f"lpunpack: {exc}", file=sys.stderr)
        return 1
    if not written:
        print("lpunpack: no matching partitions found", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
