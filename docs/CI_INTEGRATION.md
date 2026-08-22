# CI/CD Integration

Run `vulnshield` in a pipeline to fail a build on new vulnerabilities, and publish the findings
in whatever format your platform reads.

## The prerequisite nobody can skip: the NVD database

**The CLI cannot download NVD data.** `vulnshield db sync` exits with an error saying so — the
full download/import pipeline lives in the server, not the CLI. So the database has to reach the
job some other way.

The good news is that a missing or empty database cannot be mistaken for a clean scan. Both are
refused with **exit 2** and an explanatory message, rather than being reported as zero
vulnerabilities:

```
Error: NVD database not found at <path>. Run a database sync first (...)
Error: NVD database at <path> is empty. Sync CVE data before scanning.
```

That still leaves getting the database there.

Three approaches that work, roughly in order of how most teams end up doing it:

1. **Cache it.** Build `nvd-data.db` once with the app or server, publish it as a release asset
   or package, and restore it in CI. Refresh on a schedule — daily is what NIST publishes at.
2. **Bind-mount or volume it** if your runners are self-hosted and share storage.
3. **Commit it to a data repository** if size permits and your compliance posture prefers a
   pinned, auditable snapshot over a moving one.

Whichever you choose, `vulnshield db status` prints the path and CVE count, and is a cheap way to
fail early with a clearer message than the scan step would give:

```bash
vulnshield db status --db "$NVD_DB_PATH"
```

It is also the only way to notice a database that is present and non-empty but _stale_ — a
six-month-old snapshot scans perfectly happily and simply does not know about anything newer.

## GitHub Actions

The repository ships a composite action at its root, so it can be used directly:

```yaml
name: SBOM scan
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # required for upload-sarif
    steps:
      - uses: actions/checkout@v4

      - name: Restore the NVD database
        uses: actions/cache@v4
        with:
          path: .vulnshield
          key: nvd-db-${{ github.run_id }}
          restore-keys: nvd-db-

      - uses: xarlord/VulnAssesTool@master
        id: scan
        with:
          sbom: sbom.json
          database: .vulnshield/nvd-data.db
          format: sarif
          output: vulnshield.sarif
          fail-on: high

      # `if: always()` so the report is still published on the run that failed the build —
      # that is the run you most want to look at.
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.scan.outputs.report }}
```

### Inputs

| input       | default                    | meaning                                                     |
| ----------- | -------------------------- | ----------------------------------------------------------- |
| `sbom`      | _(required)_               | CycloneDX or SPDX SBOM to scan                              |
| `database`  | _(required)_               | Path to `nvd-data.db` — see above                           |
| `format`    | `sarif`                    | `console`, `json`, `sarif`, `junit`                         |
| `output`    | `vulnshield-results.sarif` | Report path; also exposed as the `report` output            |
| `fail-on`   | `high`                     | Severity at which the step exits 1                          |
| `severity`  | `low`                      | Minimum severity to include in the report                   |
| `check-kev` | `false`                    | Report only CISA Known Exploited Vulnerabilities            |
| `min-epss`  | _(unset)_                  | Report only findings with EPSS at or above this value (0-1) |
| `vex`       | _(unset)_                  | VEX document whose triaged findings should be suppressed    |

## GitLab CI

A template lives at [`docs/templates/gitlab-ci.yml`](templates/gitlab-ci.yml). Include it
remotely or copy it in:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/xarlord/VulnAssesTool/master/docs/templates/gitlab-ci.yml'
```

It defines two jobs over a shared `.vulnshield-base`: a JUnit one that gates the pipeline and
surfaces findings in the merge request widget, and a SARIF one for ingestion elsewhere.

## Any other platform

There is nothing GitHub- or GitLab-specific about the CLI. Build it and call it:

```bash
npm ci --ignore-scripts && npm run build:cli
node dist/cli/index.js scan sbom.json --db nvd-data.db --format junit --output results.xml --fail-on high
```

### Exit codes

| code | meaning                          |
| ---- | -------------------------------- |
| `0`  | clean                            |
| `1`  | findings at or above `--fail-on` |
| `2`  | error                            |
| `3`  | invalid input                    |

Distinguish `1` from `2`/`3` when scripting. Only `1` means the scan ran and found something;
treating `2` or `3` as a pass hides a broken setup behind a green build.

## Narrowing what fails the build

The filters compose, so a pipeline can start strict and stay quiet:

```bash
# Only fail on actively exploited vulnerabilities.
vulnshield scan sbom.json --db nvd-data.db --check-kev --fail-on critical

# Only fail on findings EPSS scores as likely to be exploited in the next 30 days.
vulnshield scan sbom.json --db nvd-data.db --min-epss 0.5 --fail-on high

# Suppress findings already triaged as not_affected in a VEX document.
vulnshield scan sbom.json --db nvd-data.db --vex vex.json --fail-on high
```
