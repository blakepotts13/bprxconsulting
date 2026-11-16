# Formulary Reference maintenance

The reference lives at `/tools/formulary-reference` on the BPRx website. Existing marketing pages stay public. The reference HTML, JavaScript, WebAssembly, manifest, and database chunks are served by a dynamic Node route only after server-side sign-in and approval checks. Nothing from the lookup is placed under `public/`.

## Access management

Clerk is installed through Vercel Marketplace on the Hobby ($0/month) plan. The integration provides separate development/preview and production credentials. Pull local credentials with `vercel env pull`; never commit the generated environment files or use production keys in tests.

1. A user registers at `/tools/sign-up` and verifies their email.
2. In this application's Clerk dashboard, open **Users → the user → Metadata → Public metadata**. Merge `"formularyAccess": true` into their JSON and save. This server-managed field grants access. Users cannot grant access with their editable `unsafeMetadata`.
3. To revoke access, set `"formularyAccess": false`. This overrides the bootstrap allowlist and is checked on the next asset request.

`FORMULARY_APPROVED_EMAILS` is an optional, comma-separated, server-side allowlist for initial administrators. Only Clerk-verified email addresses qualify. The website owner's verified address was configured in Vercel during setup. Signing up alone never grants lookup access. An auth service failure denies access.

Already downloaded data cannot be recalled from a browser or CSV file. The GitHub repository is public and contains public-source CMS data: application sign-in restricts the deployed lookup, not repository source access.

Production also requires the CNAME targets returned by Clerk's domain configuration at the domain's authoritative DNS provider. Vercel environment variables alone do not configure external DNS. Configure the targets for the exact production domain before releasing production sign-in.

## Data and scope

The committed snapshot contains 7,802 package rows, 7,565 NDCs and 961 HCPCS codes from the October 2026 CMS crosswalk and OPPS Addendum B. There are 308 arithmetic review flags. The CMS current-articles snapshot is dated November 8, 2026 (released November 12). The manifest preserves source URLs, hashes, dates and counts.

Illinois NGS J6 is the default scope (16 articles). The 57 other-contractor articles are labeled reference only. ICD-10 listings are article co-listings, not validated HCPCS/diagnosis coverage pairs. Independent group notes, contractor/state provenance and article links remain available. Blank diagnoses mean no matching listing in this snapshot, not a determination of noncoverage. OPPS status indicators are reference information; they do not establish critical access hospital payment. Billing-unit flags and JW/JZ guidance require review against the actual product, setting and payer rules.

## Refresh workflow

Refreshes are manual; there is no automatic CMS feed or scheduled job. Use Python with `requirements.txt` in an isolated virtual environment.

1. Update official source URLs and effective dates in `scripts/fetch_sources.py` and the `ASOF`/snapshot metadata in `scripts/build_database.py` for the intended release. Check CMS publication notices. Do not silently substitute another quarter or label a newer article archive with an older date.
2. Move aside the ignored `sources/` cache when obtaining a fresh snapshot. The fetch script reuses existing ZIP files. Run `python scripts/fetch_sources.py` from this directory.
3. Run `python scripts/build_database.py`. It builds the database, then `package_data.py` packages it into private chunks of at most 2 MiB and updates each chunk's hash and the manifest. The temporary whole SQLite file is removed. Keep the HTML/UI assets and vendor license.
4. Run `corepack pnpm test:formulary`, `corepack pnpm lint`, and `corepack pnpm build` from the repository root. Review count/scope changes, flagged units, sample NDCs and policy provenance before committing the snapshot.
5. Deploy a preview and verify access controls and searches before merging the reviewed refresh.

The client verifies chunk lengths, chunk hashes and the assembled database hash before opening SQLite. The chunk size stays below Vercel's function response limit. Authenticated exports assemble the already downloaded database in the browser.

## Verification

`pnpm test:formulary` checks the real SQLite database and UI (NDC/description/HCPCS/ICD searches, 308 flagged rows, scope isolation and exports), the approval policy, file allowlist, denied access, private caching and chunk integrity.

For an opt-in live integration test, start the site with development Clerk credentials, then run:

```bash
node --use-env-proxy --env-file=.env.local tests/live-formulary-access.mjs
```

Set `FORMULARY_TEST_BASE_URL` to test a preview instead of localhost. The test refuses production keys, creates one temporary development-only user and session, verifies pending/approved/revoked access through the real route, and deletes the user afterward. It sends no invitations. Environments requiring an HTTP proxy must also start Next.js with their normal proxy configuration (`NODE_USE_ENV_PROXY=1` on supported Node versions).

Build tracing must include `formulary-reference/assets/**/*` in the dynamic route's `.nft.json`. Preserve the `outputFileTracingIncludes` setting in `next.config.mjs`.
