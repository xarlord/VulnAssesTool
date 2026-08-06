#!/usr/bin/env python3
"""
sbom-diff.py — cross-check a supplier-provided SBOM against an independently
image-derived one, to catch components the supplier's SBOM *omitted*.

The threat model (docs/sbom-cataloging-guidelines.md): a supplier's SBOM can't be
trusted to be complete — a component could be left out (accidentally or to duck a
known CVE). Our binary-derived catalog (android-catalog.py) is enumeration-complete,
so components present in the image but absent from the supplier's SBOM are exactly
the things to scrutinize.

Reads CycloneDX (`components[]`) or SPDX (`packages[]`) JSON on either side; matches
by component name (case-insensitive), since versions are often missing/mismatched.

Usage: sbom-diff.py --supplier <sbom.json> --image <catalog.json>
Prints a JSON report on stdout and a summary on stderr; exit 3 if omissions exist.
"""

import argparse
import json
import sys


def load_names(path):
    """Return {lowercased-name: original-name} from a CycloneDX or SPDX JSON SBOM."""
    with open(path) as fh:
        doc = json.load(fh)
    names = {}
    for comp in doc.get("components", []) or []:  # CycloneDX
        name = comp.get("name")
        if name:
            names[name.lower()] = name
    for pkg in doc.get("packages", []) or []:  # SPDX
        name = pkg.get("name")
        if name:
            names[name.lower()] = name
    return names


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--supplier", required=True, help="supplier-provided SBOM (CycloneDX/SPDX json)")
    ap.add_argument("--image", required=True, help="image-derived SBOM (android-catalog output)")
    args = ap.parse_args(argv[1:])

    supplier = load_names(args.supplier)
    image = load_names(args.image)

    omitted = sorted(orig for low, orig in image.items() if low not in supplier)
    extra = sorted(orig for low, orig in supplier.items() if low not in image)

    report = {
        "supplierCount": len(supplier),
        "imageCount": len(image),
        "omittedFromSupplier": omitted,
        "onlyInSupplier": extra,
    }
    json.dump(report, sys.stdout)

    print(
        f"sbom-diff: supplier={len(supplier)} image={len(image)} | "
        f"{len(omitted)} present in image but MISSING from supplier SBOM"
        + (f" (e.g. {', '.join(omitted[:8])})" if omitted else ""),
        file=sys.stderr,
    )
    return 3 if omitted else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
