# Staging D1 backup runbook

This is a **Paul-only, read-only** procedure for taking a private backup of
the G5 staging database before any remote migration or Worker deployment. It
does not deploy, migrate, restore, change Cloudflare settings, or enable either
account flag. CODiE has not run these commands.

The target is the database named `between-g5-staging` in
`wrangler.staging.jsonc` (database ID
`8280b0ec-4f1c-42e9-918f-613c7578c83c`). Use the repository checkout only to
read that config; write every backup and evidence file outside the repository.

Wrangler's current D1 export syntax is documented by Cloudflare at
<https://developers.cloudflare.com/workers/wrangler/commands/d1/>. The
important safeguards here are the explicit database name, `--remote`, the
staging config, and an output path in a private folder.

## 1. Prepare a private destination

Use a folder protected by your normal Windows account/BitLocker policy, not
`PrimeLabyrinth`, `public_html`, `dist`, OneDrive sharing, GitHub, chat or an
issue. The SQL contains sensitive hashes and historical data; do not open it in
a text editor or paste its contents into a message.

In PowerShell, from the repository root:

```powershell
$backupRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'PrimeLabyrinth-private-backups'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupFile = Join-Path $backupRoot "between-g5-staging-$stamp.sql"
$evidenceFile = Join-Path $backupRoot "between-g5-staging-$stamp-evidence.txt"
Write-Host "Backup target: $backupFile"
```

Check that `$backupRoot` is outside the repository before continuing. Do not
use `--skip-confirmation`; the confirmation prompt is an intentional pause.

## 2. Export the complete remote database

Run exactly this command. It exports schema and data; it is not a migration or
restore:

```powershell
npx wrangler d1 export between-g5-staging `
  --remote `
  --config .\wrangler.staging.jsonc `
  --output $backupFile
```

When Wrangler asks for confirmation, check that it names the staging database
and the private output path, then confirm. A successful export should leave a
non-empty `.sql` file. If the command fails or the target is ambiguous, stop;
do not substitute another database name or remove the confirmation flag.

Immediately record file metadata and a checksum without printing SQL contents:

```powershell
Get-Item -LiteralPath $backupFile |
  Select-Object FullName,Length,LastWriteTimeUtc |
  Tee-Object -FilePath $evidenceFile
Get-FileHash -Algorithm SHA256 -LiteralPath $backupFile |
  Tee-Object -FilePath $evidenceFile -Append
```

Keep the checksum with the evidence, not in the repository. The export is the
backup; a D1 Time Travel bookmark is useful supplementary evidence but is not a
standalone backup.

## 3. Record migration state and table inventory

These commands are read-only. Save their output beside the backup and record
the UTC time and the reviewed commit SHA in the evidence file:

```powershell
git rev-parse HEAD | Tee-Object -FilePath $evidenceFile -Append
(npx wrangler --version) | Tee-Object -FilePath $evidenceFile -Append
(Get-Date).ToUniversalTime().ToString('o') |
  Tee-Object -FilePath $evidenceFile -Append

npx wrangler d1 migrations list between-g5-staging `
  --remote `
  --config .\wrangler.staging.jsonc |
  Tee-Object -FilePath $evidenceFile -Append

npx wrangler d1 execute between-g5-staging `
  --remote `
  --config .\wrangler.staging.jsonc `
  --command "PRAGMA table_list;" `
  --json |
  Tee-Object -FilePath $evidenceFile -Append
```

Do not assume the database is empty or that every repository migration is
already applied. Record the tables actually returned. The current repository
can define `travellers`, `visits`, `commands`, `world_occupancy`,
`discoveries`, and account/invitation tables, but the remote inventory is the
authority. Record absent tables as **absent** rather than creating or querying
them.

## 4. Record row counts and integrity without changing data

For each table that the inventory shows, run a separate count command. Start
with these known tables only when they are present:

```powershell
npx wrangler d1 execute between-g5-staging --remote --config .\wrangler.staging.jsonc `
  --command "SELECT 'travellers' AS table_name, COUNT(*) AS row_count FROM travellers;" --json |
  Tee-Object -FilePath $evidenceFile -Append

npx wrangler d1 execute between-g5-staging --remote --config .\wrangler.staging.jsonc `
  --command "SELECT 'visits' AS table_name, COUNT(*) AS row_count FROM visits;" --json |
  Tee-Object -FilePath $evidenceFile -Append

npx wrangler d1 execute between-g5-staging --remote --config .\wrangler.staging.jsonc `
  --command "SELECT 'commands' AS table_name, COUNT(*) AS row_count FROM commands;" --json |
  Tee-Object -FilePath $evidenceFile -Append

npx wrangler d1 execute between-g5-staging --remote --config .\wrangler.staging.jsonc `
  --command "SELECT 'world_occupancy' AS table_name, COUNT(*) AS row_count FROM world_occupancy;" --json |
  Tee-Object -FilePath $evidenceFile -Append

npx wrangler d1 execute between-g5-staging --remote --config .\wrangler.staging.jsonc `
  --command "SELECT 'discoveries' AS table_name, COUNT(*) AS row_count FROM discoveries;" --json |
  Tee-Object -FilePath $evidenceFile -Append
```

If `profiles`, `accounts`, `sessions`, `oauth_attempts`, `auth_limits`,
`invitations`, `invitation_redemptions`, `legacy_upgrade_eligibility` or
`legacy_upgrade_proofs` appears in `PRAGMA table_list`, run the same pattern
for each existing table. Do not query a table that the inventory says is
absent. Do not include row data, hashes or tokens in evidence.

Finally check foreign-key integrity:

```powershell
npx wrangler d1 execute between-g5-staging --remote --config .\wrangler.staging.jsonc `
  --command "PRAGMA foreign_key_check;" --json |
  Tee-Object -FilePath $evidenceFile -Append
```

An empty result is the expected clean check. Any rows, command errors, or
unexpected table/count changes are a stop condition for Sara/Paul review.

## 5. Close-out and retention

Record in the private evidence file:

- exact backup path, UTC timestamp, byte length and SHA-256;
- reviewed source commit SHA and Wrangler version;
- migration-list output and the actual table inventory;
- one count per table (or **absent**), plus foreign-key-check output;
- the D1 Time Travel bookmark, if Paul has one, labelled supplementary rather
  than a replacement for this export.

Verify that the backup and evidence paths are outside Git:

```powershell
git status --short
```

It should not list either file. Keep both files in the private backup location
until the invited-account test and rollback window are closed. Do not upload,
email, commit, or paste the SQL. Paul should decide the later encrypted
retention/deletion policy after Sara records the review evidence.

Only after Sara reviews this evidence may Paul proceed to the separately
approved migration/Worker deployment step. Keep `ACCOUNTS_ENABLED=false` and
`REGISTRATION_ENABLED=false` throughout the backup and closed-state checks.
