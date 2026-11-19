# Formulary Reference maintenance

The reference lives at `/tools/formulary-reference` on the BPRx website. Existing marketing pages stay public. The reference HTML, JavaScript, WebAssembly, manifest, and database chunks are served by a dynamic Node route only after server-side sign-in and approval checks. Nothing from the lookup is placed under `public/`.

## Access management

Clerk is installed through Vercel Marketplace on the Hobby ($0/month) plan. The integration provides separate development/preview and production credentials. Pull local credentials with `vercel env pull`; never commit the generated environment files or use production keys in tests.

1. A user registers at `/tools/sign-up` and verifies their email.
2. In this application's Clerk dashboard, open **Users → the user → Metadata → Public metadata**. Merge `"formularyAccess": true` into their JSON and save. This server-managed field grants access. Users cannot grant access with their editable `unsafeMetadata`.
3. To revoke access, set `"formularyAccess": false`. This overrides the bootstrap allowlist and is checked on the next asset request.

`FORMULARY_APPROVED_EMAILS` is an optional, comma-separated, server-side allowlist for initial administrators. Only Clerk-verified email addresses qualify. The website owner's verified address was configured in Vercel during setup. Signing up alone never grants lookup access. An auth service failure denies access.

Already downloaded data cannot be recalled from a browser or CSV file. The snapshot uses public-source CMS data. If the GitHub repository is public, its source and bundled data are visible there: application sign-in restricts the deployed lookup, not repository source access.

Production also requires the CNAME targets returned by Clerk's domain configuration at the domain's authoritative DNS provider. Vercel environment variables alone do not configure external DNS. Configure the targets for the exact production domain before releasing production sign-in.

## Data and scope

The committed snapshot contains 7,802 package rows, 7,565 NDCs and 961 HCPCS codes from the October 2026 CMS crosswalk and OPPS Addendum B. There are 308 arithmetic review flags. The CMS current-articles snapshot is dated November 8, 2026 (released November 12). The manifest preserves source URLs, hashes, dates and counts.

Illinois NGS J6 is the default scope (16 articles). The 57 other-contractor articles are labeled reference only. ICD-10 listings are article co-listings, not validated HCPCS/diagnosis coverage pairs. Independent group notes, contractor/state provenance and article links remain available. Blank diagnoses mean no matching listing in this snapshot, not a determination of noncoverage. OPPS status indicators are reference information; they do not establish critical access hospital payment. Billing-unit flags and JW/JZ guidance require review against the actual product, setting and payer rules.

### Medicare Allowable

Drug details and CSV exports include **Medicare Allowable**, the published CMS
quarterly Part B amount per HCPCS billing unit. The October–December 2026 source
provides numeric amounts for 885 mapped HCPCS codes and 7,520 package mappings.
This is a code-level benchmark shared by mapped NDCs, not an NDC acquisition
price, a price per package, raw ASP, or a CAH reimbursement estimate. Applicable
add-ons are already included: do not add another 6% or multiply a rate by a
package quantity without verifying the HCPCS units.

The importer preserves source decimal precision, the pricing file's own billing
unit, effective dates, CMS methodology notes, and the companion manufacturer NDRA
restriction list. Missing or `N/A` amounts display “No numeric amount published”
and export as “Not published,” never an assumed zero. The rate's presence does
not establish coverage. The detail card and Sources dialog link to the original
CMS ZIP and explain the CAH payment distinction. Where the two CMS files use
different billing-unit descriptions, the card flags both source values for
equivalence review; rates are never automatically rescaled. The CSV includes
the same comparison flag.

To refresh **only pricing within the same crosswalk quarter**, from this directory:

```sh
python scripts/fetch_sources.py --only allowables --refresh
python scripts/update_allowables.py
```

This verifies and reconstructs the private database chunks, replaces only the
pricing table, updates source hashes/counts and embedded metadata, and repackages
the database. Crosswalk rows and policy articles are preserved. For a new quarter,
update and validate the URL/quarter/date constants in `medicare_allowable.py`,
the fetch source URL, and the crosswalk snapshot together. The importer rejects
unexpected periods, malformed amounts, duplicate HCPCS rates, and mixed quarters.

### Supplemental J1815 mappings

The production secret `FORMULARY_J1815_PACKAGES` contains a JSON array of
supplemental package rows. Each row holds the hyphenated 11-digit NDC, drug name,
labeler, volume in mL, items per pack, insulin units per mL, and package source.
The three numeric fields are null when the package could not be verified.
The approved-user route serves this data with private cache headers. Keep the
supplied document and its extracted rows out of the public repository.

The lookup loads these rows alongside the verified CMS database. CMS mappings
are retained, and the workbook flags any supplemental match for review without
populating the CMS result column. Recheck the J1815 descriptor and OPPS indicator
when updating the CMS snapshot.

### DailyMed fallback assignments

An exact NDC absent from the CMS and supplemental mappings can trigger a
DailyMed package lookup. The service uses the FDA NDC Directory and NLM RxClass
to check the prescription listing, form, route, and drug class. The lookup and
audit label J8499 and J3490 assignments as DailyMed fallbacks. The workbook
records them in a separate column and carries the source label on its review tab.
Products with a possible specific code, special coding, or unconfirmed evidence
go to review. Review the label and payer rules for coverage and billing units.

The descriptor index uses the CMS quarterly HCPCS file and aliases from the
packaged CMS crosswalk snapshot. After packaging a new quarter, run
\`python scripts/build_hcpcs_descriptors.py <CMS ZIP path> <CMS ZIP URL>\` from
this directory. The lookup only assigns fallback codes when the index matches
the active quarter.

### HCPCS history by item

The active drug details show the codes and billing-unit descriptions listed for
the same 11-digit package NDC in archived CMS crosswalks. The bundled data spans
2022 Q1 through the effective lookup quarter. Consecutive listings with the same
code and unit appear as a range. Missing quarters are left as gaps. Ambiguous
identifiers and drug-name matching are excluded. The methylprednisolone
formulation-level CMS decision is shown separately from item observations.

After rebuilding the lookup for a new effective quarter, run
`python scripts/build_hcpcs_history.py` from this directory. It uses the lookup
manifest's quarter, downloads the CMS archives and generates the private history
asset with source URLs and archive hashes. `--cached` reuses locally saved
downloads during development. An unsuccessful rebuild leaves the last generated
file available. Review the source changes before publishing.

## Refresh workflow

Refreshes are manual; there is no automatic CMS feed or scheduled job. Use Python with `requirements.txt` in an isolated virtual environment.

1. Update official source URLs and effective dates in `scripts/fetch_sources.py` and `scripts/medicare_allowable.py`, and the `ASOF`/snapshot metadata in `scripts/build_database.py` for the intended release. Check CMS publication notices. Do not silently substitute another quarter or label a newer article archive with an older date.
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

### Users & Access administration

Open `/tools/users-access` (also linked from `/tools/account` for administrators).
`FORMULARY_ADMIN_EMAILS` is a **server-only** comma-separated list of verified
primary email addresses of protected owners allowed to administer access and
manage administrator roles. It is independent of
`FORMULARY_APPROVED_EMAILS`. Alternatively, designate another administrator with
server-managed Clerk **private** metadata `formularyAdmin: true`; their primary
email must be verified. Public and unsafe metadata cannot grant administrator
rights. Ordinary approval never grants administrator rights.

Owners can now use **All users → Make admin** on an approved account with a
verified primary email. **Administrators → Remove admin** removes the delegated
role without changing reference approval. Each action requires confirmation and
is applied to one account at a time. Other administrators cannot change roles,
including through direct API calls. Owner accounts cannot be demoted here;
bootstrap owners remain configured in the server environment. Blocked accounts
cannot be promoted, and an assigned role can be removed even if its holder later
becomes blocked or unverified. Role changes take effect on the next admin request.
Role and approval changes share the account's recent access history.

The directory defaults to pending users. Search by name/email, approve users
individually or in batches of up to 20, and revoke reference access immediately
on the next request. Administrator accounts are protected from revocation here.
Keep the bootstrap owner in the server environment so it cannot be removed by a
routine approval change.

Invitations are preapproved, expire in seven days, and send Clerk's invitation
email only after the administrator submits and confirms the action. Existing
verified accounts are approved instead, without sending an email. Pending
invitations can be canceled; cancellation invalidates the invitation link but
does not block ordinary signup (which still requires separate approval).
Invitations grant reference access only, never administrator rights. Existing
sign-in and email-verification settings still apply.

Each account retains the latest eight approval/revocation and administrator-role events made through this
page in Clerk private metadata, recording the server-derived administrator
email and timestamp. Metadata patches preserve unrelated fields. This is recent
operational history, not an immutable audit log: concurrent writes to the same
account can overwrite history, and earlier/manual Clerk edits are not recorded.
Invitations show their creation date. No separate database or paid service is
required. Search results are capped at 1,000 users and 1,000 pending invitations;
the page displays a warning to narrow the search if that cap is reached.

Every admin read and mutation rechecks the current Clerk user on the server.
Responses are private/no-store; writes additionally require same-origin JSON.
Tests cover privilege separation, unauthenticated/non-admin denials, origin
checks, batch limits, invitation behavior, history, and protected administrators.

## Production quarterly preview

Approved users can open **Quarterly updates** from the lookup. The upcoming
quarter opens at midnight Central on December 15, March 15, June 15, and
September 15. After the rollover it is available under **Current quarter
report**. The preview is separate from the effective formulary snapshot.

The GitHub Actions workflow `cms-quarterly-preview.yml` checks official CMS
publication pages daily, compares available source pairs, and pushes only
changed public CMS-derived reports to the `cms-quarterly-data` branch. That
branch has Vercel auto-deploy disabled. The site reads it server side (15-minute
cache) and gates display by approval and date. January 2027's first HCPCS report
is also bundled for fallback. Unavailable source pairs display a pending status.
A failed fetch or parser leaves the previously published report intact.

Run the workflow manually to refresh a particular quarter, or generate a
comparison locally with `python scripts/quarterly_report.py --quarter 2027-Q1
--output /tmp/cms-report`. The schedule only publishes the preview and report.
Use the effective-snapshot refresh workflow above to update the actual lookup.
