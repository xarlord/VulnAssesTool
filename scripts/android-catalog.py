#!/usr/bin/env python3
"""
Android SBOM catalog/merge — maximize component recall from an extracted Android
filesystem tree and make coverage gaps explicit (never silently drop a binary).

Combines, into one CycloneDX document:
  * Syft's CycloneDX          (--syft)   — package DBs, language & versioned natives
  * cve-bin-tool's CycloneDX  (--cbt)    — optional; off by default (slow + low yield
                                           on stripped Android natives, high on firmware)
  * Exhaustive ELF inventory  (--tree)   — EVERY executable/.so/.ko is emitted as a
                                           component, versioned where derivable, else
                                           flagged coverage=gap so it's reviewable
  * Targeted probes           (--tree)   — string-signature versions for high-value
                                           natives Syft misses (e.g. toybox), with CPE
  * Kernel                    (--kernel) — injected as a linux_kernel OS component

Provenance is recorded per component (property `vat:source`), and every component
carries `vat:coverage` = "identified" (has a version) or "gap" (no version → manual
review, per docs/sbom-cataloging-guidelines.md §0.3/§5). Stdlib only.
"""

import argparse
import json
import os
import re
import sys

ELF_MAGIC = b"\x7fELF"

# Targeted probes for high-value natives whose version Syft/cve-bin-tool miss.
# marker: a byte string that must appear in the file to accept a version match.
# version_re: first group is the version. cpe: (vendor, product) for CPE-first matching.
# These are best-effort: Android natives are often stripped of version banners, so
# a probe only emits a version when the signature is actually present.
PROBES = [
    {
        "name": "toybox",
        "match_names": ("toybox", "toybox_vendor"),
        "marker": b"toybox",
        "version_re": re.compile(rb"([0-9]+\.[0-9]+\.[0-9]+)(?:-android)?"),
        "cpe": ("toybox_project", "toybox"),
    },
    {
        "name": "zlib",
        "match_names": ("libz.so",),
        "marker": b"inflate",
        "version_re": re.compile(rb"(?:in|de)flate ([0-9]+\.[0-9]+(?:\.[0-9]+)?) Copyright"),
        "cpe": ("zlib", "zlib"),
    },
    {
        "name": "libpng",
        "match_names": ("libpng.so",),
        "marker": b"libpng version",
        "version_re": re.compile(rb"libpng version ([0-9]+\.[0-9]+\.[0-9]+)"),
        "cpe": ("libpng", "libpng"),
    },
    {
        "name": "sqlite",
        "match_names": ("libsqlite.so", "libsqlite3.so"),
        "marker": b"sqlite3",
        "version_re": re.compile(rb"(3\.[0-9]+\.[0-9]+)(?: |\x00)"),
        "cpe": ("sqlite", "sqlite"),
    },
    {
        "name": "freetype",
        "match_names": ("libft2.so", "libfreetype.so"),
        "marker": b"FreeType",
        "version_re": re.compile(rb"FreeType ([0-9]+\.[0-9]+\.[0-9]+)"),
        "cpe": ("freetype", "freetype"),
    },
    {
        "name": "expat",
        "match_names": ("libexpat.so",),
        "marker": b"expat_",
        "version_re": re.compile(rb"expat_([0-9]+\.[0-9]+\.[0-9]+)"),
        "cpe": ("libexpat_project", "libexpat"),
    },
    {
        "name": "curl",
        "match_names": ("libcurl.so",),
        "marker": b"libcurl/",
        "version_re": re.compile(rb"libcurl/([0-9]+\.[0-9]+\.[0-9]+)"),
        "cpe": ("haxx", "libcurl"),
    },
    {
        "name": "pcre2",
        "match_names": ("libpcre2.so", "libpcre2-8.so"),
        "marker": b"PCRE2",
        "version_re": re.compile(rb"([0-9]+\.[0-9]+) [0-9]{4}-[0-9]{2}-[0-9]{2}"),
        "cpe": ("pcre", "pcre2"),
    },
]

# Known third-party OSS libraries worth surfacing even when version-less (they
# are the CVE-relevant natives). A version-less ELF is kept in the default output
# ONLY if its name is here; everything else (framework/vendor libs) is noise that
# moves to the --full-inventory appendix. Matched against the derived name and the
# same name with a leading "lib" stripped.
THIRD_PARTY_LIBS = {
    "libcrypto", "libssl", "boringssl", "libz", "zlib", "libpng", "libjpeg", "libjpeg-turbo",
    "libturbojpeg", "libxml2", "libsqlite", "libsqlite3", "sqlite", "libcurl", "curl", "libexpat",
    "libcares", "libwebp", "libft2", "libfreetype", "freetype", "libharfbuzz", "libbrotli",
    "libbrotlidec", "libbrotlienc", "liblzma", "libbz2", "libssh2", "libnghttp2", "libprotobuf",
    "libprotobuf-cpp-full", "libpcre", "libpcre2", "libevent", "libusb", "libgcrypt", "libgnutls",
    "libvpx", "libopus", "libflac", "libogg", "libvorbis", "libsonivox", "libtinyxml2", "libyuv",
    "libjsoncpp", "libunwind", "libcap", "libselinux", "libpcap", "libnl", "libdbus", "libffi",
    "libicu", "libicuuc", "libicui18n", "toybox", "busybox", "dnsmasq", "wpa_supplicant", "hostapd",
    "libavcodec", "libavformat", "libavutil", "libssl3", "libnss", "libopenjdk", "libaom", "libdav1d",
    "libhevc", "libavc", "libmpeg2", "libgav1", "libcrypto_utils",
}


def is_third_party(name):
    low = name.lower()
    return low in THIRD_PARTY_LIBS or (low.startswith("lib") and low[3:] in THIRD_PARTY_LIBS)


def is_elf(path):
    try:
        with open(path, "rb") as fh:
            return fh.read(4) == ELF_MAGIC
    except OSError:
        return False


def elf_kind(name):
    if name.endswith(".ko"):
        return "kernel-module"
    if ".so" in name:
        return "shared-library"
    return "executable"


def name_and_version(filename):
    """Best-effort (name, version) from a native filename."""
    base = filename
    m = re.match(r"^(.*)\.so\.(\d[\d.]*)$", base)  # libfoo.so.1.2.3
    if m:
        return m.group(1), m.group(2)
    m = re.match(r"^(.*)\.(so|ko)$", base)  # strip .so/.ko
    if m:
        base = m.group(1)
    m = re.match(r"^(.*?)-(\d+(?:\.\d+)+)$", base)  # libfoo-1.2 / ...-21.12
    if m:
        return m.group(1), m.group(2)
    return base, ""


def probe_versions(path, filename):
    """Return list of (probe, version) for probes that match this file."""
    matches = []
    applicable = [p for p in PROBES if filename in p["match_names"]]
    if not applicable:
        return matches
    try:
        with open(path, "rb") as fh:
            blob = fh.read(64 * 1024 * 1024)  # cap read for huge files
    except OSError:
        return matches
    for probe in applicable:
        if probe["marker"] not in blob:
            continue
        vm = probe["version_re"].search(blob)
        if vm:
            matches.append((probe, vm.group(1).decode("ascii", "replace")))
    return matches


def cpe23(vendor, product, version):
    return f"cpe:2.3:a:{vendor}:{product}:{version}:*:*:*:*:*:*:*"


# --- APEX manifest (name + version) --------------------------------------
def _read_varint(data, i):
    val = 0
    shift = 0
    while i < len(data):
        b = data[i]
        i += 1
        val |= (b & 0x7F) << shift
        if not b & 0x80:
            break
        shift += 7
    return val, i


def parse_apex_pb(data):
    """Minimal protobuf read of apex_manifest.pb: field 1=name (str), 2=version (int)."""
    name = None
    version = None
    i = 0
    try:
        while i < len(data):
            tag = data[i]
            i += 1
            field, wt = tag >> 3, tag & 7
            if wt == 0:
                val, i = _read_varint(data, i)
                if field == 2:
                    version = val
            elif wt == 2:
                ln, i = _read_varint(data, i)
                seg = data[i : i + ln]
                i += ln
                if field == 1:
                    name = seg.decode("utf-8", "replace")
            else:
                break
    except (IndexError, ValueError):
        pass
    return name, (str(version) if version is not None else "")


def apex_info(path):
    """Return (name, version) for an .apex file or an apex_manifest.{pb,json}."""
    import zipfile

    try:
        base = os.path.basename(path)
        if base == "apex_manifest.json":
            doc = json.load(open(path))
            return doc.get("name", ""), str(doc.get("version", ""))
        if base == "apex_manifest.pb":
            return parse_apex_pb(open(path, "rb").read())
        if path.endswith(".apex") or path.endswith(".capex"):
            with zipfile.ZipFile(path) as zf:
                names = set(zf.namelist())
                if "apex_manifest.json" in names:
                    doc = json.loads(zf.read("apex_manifest.json"))
                    return doc.get("name", ""), str(doc.get("version", ""))
                if "apex_manifest.pb" in names:
                    return parse_apex_pb(zf.read("apex_manifest.pb"))
    except (OSError, ValueError, KeyError, zipfile.BadZipFile):
        pass
    return None


# --- APK AndroidManifest (package + versionName) -------------------------
def _axml_strings(data):
    """Return the string-pool list of a binary AndroidManifest.xml (AXML)."""
    import struct

    if len(data) < 8 or data[0:4] != b"\x03\x00\x08\x00":
        return None
    # Find the string-pool chunk (type 0x0001) — usually right after the 8-byte file header.
    pos = 8
    while pos + 8 <= len(data):
        ctype, _hsize, csize = struct.unpack_from("<HHI", data, pos)
        if csize <= 0 or pos + csize > len(data):
            return None
        if ctype == 0x0001:
            count, _style_cnt, flags, str_start = struct.unpack_from("<IIII", data, pos + 8)
            utf8 = bool(flags & 0x100)
            offs = [struct.unpack_from("<I", data, pos + 28 + n * 4)[0] for n in range(count)]
            base = pos + str_start
            out = []
            for off in offs:
                p = base + off
                try:
                    if utf8:
                        # u16 length (skip), then u8 byte-length, then UTF-8
                        _n16, p = _axml_len(data, p, True)
                        blen, p = _axml_len(data, p, True)
                        out.append(data[p : p + blen].decode("utf-8", "replace"))
                    else:
                        n16, p = _axml_len(data, p, False)
                        out.append(data[p : p + n16 * 2].decode("utf-16-le", "replace"))
                except (IndexError, ValueError):
                    out.append("")
            return out
        pos += csize
    return None


def _axml_len(data, p, utf8):
    val = data[p]
    p += 1
    if utf8:
        if val & 0x80:
            val = ((val & 0x7F) << 8) | data[p]
            p += 1
    else:
        val2 = data[p]
        p += 1
        val = val | (val2 << 8)
        if val & 0x8000:
            val = ((val & 0x7FFF) << 16) | (data[p] | (data[p + 1] << 8))
            p += 2
    return val, p


def parse_axml_manifest(data):
    """Extract (package, versionName) from binary AndroidManifest.xml, best-effort."""
    import struct

    strings = _axml_strings(data)
    if not strings:
        return None
    result = {"package": "", "versionName": ""}
    pos = 8
    while pos + 8 <= len(data):
        ctype, _hsize, csize = struct.unpack_from("<HHI", data, pos)
        if csize <= 0 or pos + csize > len(data):
            break
        if ctype == 0x0102:  # START_ELEMENT
            name_idx = struct.unpack_from("<I", data, pos + 20)[0]
            elem = strings[name_idx] if name_idx < len(strings) else ""
            if elem == "manifest":
                attr_count = struct.unpack_from("<H", data, pos + 28)[0]
                astart = pos + 36
                for a in range(attr_count):
                    off = astart + a * 20
                    a_name = struct.unpack_from("<I", data, off + 4)[0]
                    a_rawval = struct.unpack_from("<i", data, off + 8)[0]
                    a_type = data[off + 15]
                    a_data = struct.unpack_from("<I", data, off + 16)[0]
                    key = strings[a_name] if a_name < len(strings) else ""
                    if key in ("package", "versionName"):
                        val = ""
                        if a_type == 0x03 and a_data < len(strings):  # TYPE_STRING
                            val = strings[a_data]
                        elif a_rawval >= 0 and a_rawval < len(strings):
                            val = strings[a_rawval]
                        elif a_type == 0x10:  # INT_DEC
                            val = str(a_data)
                        result[key] = val
                return result if result["package"] else None
        pos += csize
    return None


def apk_info(path):
    """Return (package, versionName) for an .apk, or None on failure."""
    import zipfile

    try:
        with zipfile.ZipFile(path) as zf:
            if "AndroidManifest.xml" not in zf.namelist():
                return None
            parsed = parse_axml_manifest(zf.read("AndroidManifest.xml"))
    except (OSError, ValueError, KeyError, zipfile.BadZipFile):
        return None
    if not parsed:
        return None
    return parsed["package"], parsed["versionName"]


class Catalog:
    """Accumulates components keyed by (name.lower, version), merging provenance."""

    def __init__(self):
        self._by_key = {}

    def add(self, name, version, source, *, cpe=None, purl=None, ctype="library", path=None):
        if not name:
            return
        # Syft reports unidentified components as version "UNKNOWN" — treat that
        # (and other non-versions) as no version so they're gaps, not false hits.
        if version and version.strip().lower() in ("unknown", "none", "*", "n/a"):
            version = ""
        version = version or ""
        key = (name.lower(), version)
        entry = self._by_key.get(key)
        if entry is None:
            entry = {
                "type": ctype,
                "name": name,
                "sources": set(),
                "paths": set(),
                "cpe": None,
                "purl": None,
            }
            if version:
                entry["version"] = version
            self._by_key[key] = entry
        entry["sources"].add(source)
        if path:
            entry["paths"].add(path)
        # Prefer a real CPE/PURL if any source supplies one.
        if cpe and not entry["cpe"]:
            entry["cpe"] = cpe
        if purl and not entry["purl"]:
            entry["purl"] = purl
        return entry

    def to_components(self, full_inventory=False):
        # If a name has any identified version, drop its redundant version-less
        # "gap" entry (e.g. keep toybox@0.8.11, drop the bare toybox from the
        # ELF inventory) so the same component isn't listed twice.
        names_with_version = {nm for (nm, ver) in self._by_key if ver}
        components = []
        for (nm, ver), entry in self._by_key.items():
            if not ver and nm in names_with_version:
                continue
            version = entry.get("version", "")
            # Noise suppression: default output = versioned components + known
            # third-party OSS libs (even version-less, e.g. BoringSSL, so they're
            # surfaced for review). Everything else version-less (framework/vendor
            # libs, unversioned kernel modules) moves to the --full-inventory view.
            if not full_inventory and not version and not is_third_party(entry["name"]):
                continue
            props = [
                {"name": "vat:source", "value": ",".join(sorted(entry["sources"]))},
                {"name": "vat:coverage", "value": "identified" if version else "gap"},
            ]
            if entry["paths"]:
                sample = sorted(entry["paths"])[0]
                props.append({"name": "vat:path", "value": sample})
                if len(entry["paths"]) > 1:
                    props.append({"name": "vat:instances", "value": str(len(entry["paths"]))})
            comp = {"type": entry["type"], "name": entry["name"], "properties": props}
            if version:
                comp["version"] = version
            if entry["cpe"]:
                comp["cpe"] = entry["cpe"]
            comp["purl"] = entry["purl"] or (
                f"pkg:generic/{entry['name']}@{version}" if version else f"pkg:generic/{entry['name']}"
            )
            components.append(comp)
        components.sort(key=lambda c: (c.get("properties", [{}])[1]["value"] != "gap", c["name"].lower()))
        return components


def load_cyclonedx(path):
    if not path or not os.path.exists(path):
        return []
    try:
        return json.load(open(path)).get("components", []) or []
    except (OSError, ValueError):
        return []


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--tree", help="extracted filesystem tree to inventory")
    ap.add_argument("--syft", help="syft CycloneDX json to merge")
    ap.add_argument("--cbt", help="cve-bin-tool CycloneDX json to merge (optional)")
    ap.add_argument("--kernel", default="", help="linux kernel version to inject")
    ap.add_argument(
        "--full-inventory",
        action="store_true",
        help="emit EVERY native (incl. framework/vendor libs); default keeps only versioned + known third-party",
    )
    args = ap.parse_args(argv[1:])

    cat = Catalog()

    # Syft + (optional) cve-bin-tool components.
    for source, path in (("syft", args.syft), ("cve-bin-tool", args.cbt)):
        for comp in load_cyclonedx(path):
            cat.add(
                comp.get("name", ""),
                comp.get("version", ""),
                source,
                cpe=comp.get("cpe"),
                purl=comp.get("purl"),
                ctype=comp.get("type", "library"),
            )

    # Exhaustive ELF inventory + targeted probes + APK/APEX manifests.
    if args.tree and os.path.isdir(args.tree):
        for dirpath, _dirs, files in os.walk(args.tree):
            for fn in files:
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, args.tree)
                low = fn.lower()
                if low.endswith(".apk"):  # Android app — version from AndroidManifest
                    info = apk_info(full)
                    if info:
                        pkg, ver = info
                        cat.add(pkg or fn, ver, "apk", purl=f"pkg:apk/{pkg or fn}@{ver}" if ver else None, ctype="application", path=rel)
                    continue
                if low.endswith(".apex") or low.endswith(".capex") or fn in ("apex_manifest.pb", "apex_manifest.json"):
                    info = apex_info(full)
                    if info and info[0]:
                        an, av = info
                        cat.add(an, av, "apex", purl=f"pkg:apex/{an}@{av}" if av else None, ctype="application", path=rel)
                    continue
                if not is_elf(full):
                    continue
                name, version = name_and_version(fn)
                cat.add(name, version, "elf-inventory", ctype="application" if elf_kind(fn) == "executable" else "library", path=rel)
                for probe, pver in probe_versions(full, fn):
                    v, p = probe["cpe"]
                    cat.add(
                        probe["name"],
                        pver,
                        "probe",
                        cpe=cpe23(v, p, pver),
                        purl=f"pkg:generic/{probe['name']}@{pver}",
                        path=rel,
                    )

    components = cat.to_components(full_inventory=args.full_inventory)

    if args.kernel.strip():
        kver = args.kernel.strip()
        components.append(
            {
                "type": "operating-system",
                "name": "linux_kernel",
                "version": kver,
                "cpe": f"cpe:2.3:o:linux:linux_kernel:{kver}:*:*:*:*:*:*:*",
                "purl": f"pkg:generic/linux_kernel@{kver}",
                "properties": [
                    {"name": "vat:source", "value": "boot-img"},
                    {"name": "vat:coverage", "value": "identified"},
                ],
            }
        )

    doc = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {"tools": [{"vendor": "VulnAssesTool", "name": "android-catalog"}]},
        "components": components,
    }
    json.dump(doc, sys.stdout)
    identified = sum(1 for c in components if c.get("version"))
    print(
        f"android-catalog: {len(components)} components "
        f"({identified} identified, {len(components) - identified} coverage-gap)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
