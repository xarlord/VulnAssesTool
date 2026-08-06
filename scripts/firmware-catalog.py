#!/usr/bin/env python3
"""
firmware-catalog.py — identify components in a bare-metal / RTOS firmware blob
and emit CycloneDX, per docs/sbom-cataloging-guidelines.md §3.

Reality (proven on real firmware): a stripped MCU image has no filesystem and no
version banners, so no scanner recovers component *versions* from the binary. This
tool therefore does the honest, useful thing:
  * records the firmware's own product version (from --version or the filename),
  * identifies which known components/stacks are PRESENT via byte signatures
    (FreeRTOS, mbedTLS, lwIP, wolfSSL, FatFs, newlib, …) and extracts a version
    only when a real version string is present (usually it isn't → coverage=gap),
  * emits everything as CycloneDX so nothing reads as "falsely clean".

The authoritative version source remains build metadata (Zephyr west spdx / Conan
lock) or a hand-authored CycloneDX — feed that and cross-check with sbom-diff.py.
Optional: merge a cve-bin-tool CycloneDX (--cbt) for firmwares that DO carry
version banners. Stdlib only.

Usage: firmware-catalog.py <firmware.bin> [--version X] [--cbt cbt.cdx.json]
"""

import argparse
import json
import os
import re
import sys

# Byte-signature table for common embedded stacks/libraries. version_re (optional)
# extracts a version when the banner is present; cpe (optional) enables CPE-first
# CVE matching when versioned.
SIGNATURES = [
    {"name": "freertos", "markers": (b"FreeRTOS", b"FREERTOS"), "version_re": rb"FreeRTOS[ _]?V?([0-9]+\.[0-9]+\.[0-9]+)", "cpe": ("amazon", "freertos")},
    {"name": "mbedtls", "markers": (b"mbed TLS", b"mbedtls", b"Mbed TLS"), "version_re": rb"[Mm]bed ?TLS ([0-9]+\.[0-9]+\.[0-9]+)", "cpe": ("arm", "mbed_tls")},
    {"name": "lwip", "markers": (b"lwIP", b"LWIP"), "version_re": rb"lwIP ([0-9]+\.[0-9]+\.[0-9]+)", "cpe": ("lwip_project", "lwip")},
    {"name": "wolfssl", "markers": (b"wolfSSL", b"wolfssl"), "version_re": rb"wolfSSL[ /]([0-9]+\.[0-9]+\.[0-9]+)", "cpe": ("wolfssl", "wolfssl")},
    {"name": "openssl", "markers": (b"OpenSSL",), "version_re": rb"OpenSSL ([0-9]+\.[0-9]+\.[0-9]+[a-z]?)", "cpe": ("openssl", "openssl")},
    {"name": "zlib", "markers": (b"inflate", b"deflate"), "version_re": rb"(?:in|de)flate ([0-9]+\.[0-9]+(?:\.[0-9]+)?) Copyright", "cpe": ("zlib", "zlib")},
    {"name": "fatfs", "markers": (b"FatFs",), "version_re": rb"FatFs R([0-9]+\.[0-9]+[a-z]?)", "cpe": None},
    {"name": "littlefs", "markers": (b"littlefs", b"LittleFS"), "version_re": rb"littlefs v?([0-9]+\.[0-9]+)", "cpe": None},
    {"name": "tinyusb", "markers": (b"tinyusb", b"TinyUSB"), "version_re": rb"([0-9]+\.[0-9]+\.[0-9]+)", "cpe": None},
    {"name": "zephyr", "markers": (b"Zephyr", b"ZEPHYR"), "version_re": rb"Zephyr(?: version)? ([0-9]+\.[0-9]+\.[0-9]+)", "cpe": ("zephyrproject", "zephyr")},
    {"name": "newlib", "markers": (b"newlib",), "version_re": rb"newlib ([0-9]+\.[0-9]+)", "cpe": None},
    {"name": "libc", "markers": (b"GNU C Library", b"glibc"), "version_re": rb"version ([0-9]+\.[0-9]+)", "cpe": ("gnu", "glibc")},
]


def firmware_version_from_name(path):
    """Extract a product version like 1.2.0-b.2 from the firmware filename."""
    m = re.search(r"([0-9]+\.[0-9]+\.[0-9]+(?:-[a-z]+\.?[0-9]+)?)", os.path.basename(path))
    return m.group(1) if m else ""


def cpe23(vendor, product, version):
    v = version if version else "*"
    return f"cpe:2.3:a:{vendor}:{product}:{v}:*:*:*:*:*:*:*"


def scan(blob):
    """Return list of {name, version, cpe, marker} for signatures present in blob."""
    found = []
    for sig in SIGNATURES:
        if not any(m in blob for m in sig["markers"]):
            continue
        version = ""
        if sig.get("version_re"):
            vm = re.search(sig["version_re"], blob)
            if vm:
                version = vm.group(1).decode("ascii", "replace")
        cpe = None
        if sig.get("cpe") and version:
            cpe = cpe23(sig["cpe"][0], sig["cpe"][1], version)
        found.append({"name": sig["name"], "version": version, "cpe": cpe})
    return found


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("firmware", help="firmware blob (.bin/.hex/.elf/...)")
    ap.add_argument("--version", default="", help="firmware product version (else derived from filename)")
    ap.add_argument("--cbt", default="", help="cve-bin-tool CycloneDX json to merge (optional)")
    args = ap.parse_args(argv[1:])

    if not os.path.isfile(args.firmware):
        print(f"firmware-catalog: not a file: {args.firmware}", file=sys.stderr)
        return 2

    with open(args.firmware, "rb") as fh:
        blob = fh.read()

    fw_version = args.version.strip() or firmware_version_from_name(args.firmware)
    fw_name = re.sub(r"[-_.]?v?[0-9].*$", "", os.path.basename(args.firmware)) or os.path.basename(args.firmware)

    components = [
        {
            "type": "firmware",
            "name": fw_name,
            "version": fw_version or "unknown",
            "purl": f"pkg:generic/{fw_name}@{fw_version}" if fw_version else f"pkg:generic/{fw_name}",
            "properties": [
                {"name": "vat:source", "value": "firmware"},
                {"name": "vat:coverage", "value": "identified" if fw_version else "gap"},
            ],
        }
    ]

    for comp in scan(blob):
        props = [
            {"name": "vat:source", "value": "fw-signature"},
            {"name": "vat:coverage", "value": "identified" if comp["version"] else "gap"},
        ]
        if not comp["version"]:
            # Present but unversioned: track via vendor advisories, not NVD-clean.
            props.append({"name": "vat:note", "value": "present; version not in binary — advisory-tracked"})
        entry = {"type": "library", "name": comp["name"], "properties": props}
        if comp["version"]:
            entry["version"] = comp["version"]
        if comp["cpe"]:
            entry["cpe"] = comp["cpe"]
        entry["purl"] = f"pkg:generic/{comp['name']}@{comp['version']}" if comp["version"] else f"pkg:generic/{comp['name']}"
        components.append(entry)

    # Optional cve-bin-tool merge (useful on firmwares that DO carry banners).
    if args.cbt and os.path.exists(args.cbt):
        try:
            for c in json.load(open(args.cbt)).get("components", []) or []:
                if not c.get("name"):
                    continue
                components.append(
                    {
                        "type": c.get("type", "library"),
                        "name": c["name"],
                        **({"version": c["version"]} if c.get("version") else {}),
                        **({"cpe": c["cpe"]} if c.get("cpe") else {}),
                        "purl": c.get("purl", f"pkg:generic/{c['name']}"),
                        "properties": [{"name": "vat:source", "value": "cve-bin-tool"}],
                    }
                )
        except (OSError, ValueError):
            pass

    doc = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {"tools": [{"vendor": "VulnAssesTool", "name": "firmware-catalog"}]},
        "components": components,
    }
    json.dump(doc, sys.stdout)
    identified = sum(1 for c in components if c.get("version") and c["version"] != "unknown")
    print(
        f"firmware-catalog: {fw_name}@{fw_version or '?'} — {len(components)} components "
        f"({identified} versioned, {len(components) - identified} advisory/gap)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
