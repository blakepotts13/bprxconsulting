"""Build item-level HCPCS history from quarterly CMS NDC crosswalks."""
import argparse
import hashlib
import io
import json
import re
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from quarterly_report import CODE, SOURCES, csv_rows, quarter_start, source_url, urls

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parents[1] / "formulary-reference/assets/hcpcs-history.json"
CACHE = ROOT / "sources/history"
FIRST_QUARTER = "2022-Q1"
ALLOWED_FILES = re.compile(r"\b(?:ASP|AWP|OPPS|PrEP|COVID[ _-]?19)\b", re.I)
DECISION = "https://www.cms.gov/files/document/r12552cp.pdf#page=25"
FORMULATION_CHANGES = {
    "J1010": {"formulation": "Methylprednisolone acetate", "unit": "1 mg",
              "prior": [["J1020", "20 mg"], ["J1030", "40 mg"], ["J1040", "80 mg"]]},
    "J2919": {"formulation": "Methylprednisolone sodium succinate", "unit": "5 mg",
              "prior": [["J2920", "up to 40 mg"], ["J2930", "up to 125 mg"]]},
}
for change in FORMULATION_CHANGES.values():
    change.update(effective="2024-04-01", retired="2024-03-31", source=DECISION)


def quarter_sequence(first, last):
    start, end = quarter_start(first), quarter_start(last)
    if end < start:
        raise ValueError("The last quarter must be on or after the first.")
    for year in range(start.year, end.year + 1):
        for quarter in range(1, 5):
            label = f"{year}-Q{quarter}"
            if first <= label <= last:
                yield label


def billing_ndc(value):
    value = value.strip()
    if re.fullmatch(r"[0-9]{11}", value):
        return value
    if not re.fullmatch(r"[0-9]+-[0-9]+-[0-9]+", value):
        return None
    parts = value.split("-")
    if tuple(map(len, parts)) not in {(5, 4, 2), (4, 4, 2), (5, 3, 2), (5, 4, 1)}:
        return None
    return "".join(part.zfill(size) for part, size in zip(parts, (5, 4, 2)))


def parse_history(archive):
    items = defaultdict(set)
    used = []
    for name in archive.namelist():
        lower = name.lower()
        if (not lower.endswith(".csv") or "introduction" in lower or
                "noc" in lower or not ALLOWED_FILES.search(name)):
            continue
        rows = iter(csv_rows(archive, name))
        header = next((row for row in rows if row and
                       (row[0].strip() == "HCPCS Code" or re.fullmatch(r"_20\d{2}_CODE", row[0].strip()))), None)
        if header is None or len(header) < 6 or "ndc" not in header[3].lower() or "dosage" not in header[5].lower():
            raise ValueError(f"Missing HCPCS, NDC or billing-unit column in {name}")
        used.append(name)
        for row in rows:
            if len(row) < 6 or not CODE.fullmatch(row[0].strip()):
                continue
            ndc = billing_ndc(row[3])
            if ndc:
                unit = " ".join(row[5].upper().split())
                items[ndc].add((row[0].strip(), unit))
    if not used or not items:
        raise ValueError("No usable HCPCS crosswalk rows in the CMS archive.")
    return items, sorted(used)


def read_quarter(key, links, refresh):
    url = source_url(links, "crosswalk", quarter_start(key))
    if not url:
        raise ValueError(f"CMS has not published a crosswalk for {key}.")
    path = CACHE / f"{key}.zip"
    # Use a fresh download by default. The optional cache is for local iteration.
    if refresh or not path.exists():
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        content = response.content
    else:
        content = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        items, files = parse_history(archive)
    path.write_bytes(content)
    print(f"{key}: {len(items):,} NDCs", flush=True)
    return items, {"quarter": key, "url": url, "sha256": hashlib.sha256(content).hexdigest(), "files": files}


def timeline(quarter_data):
    """Merge consecutive observations for the same NDC, code and unit."""
    items = defaultdict(list)
    last = {}
    for index, (mappings, _) in enumerate(quarter_data):
        for ndc, entries in sorted(mappings.items()):
            for code, unit in sorted(entries):
                key = ndc, code, unit
                prior = last.get(key)
                if prior and prior[1] == index - 1:
                    prior[1] = index
                else:
                    prior = [index, index, code, unit]
                    items[ndc].append(prior)
                    last[key] = prior
    return dict(sorted(items.items()))


def build(last, output, cached):
    page = SOURCES["crosswalk"][0]
    links = urls(page)
    CACHE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=5) as pool:
        quarter_data = list(pool.map(lambda key: read_quarter(key, links, not cached),
                                     quarter_sequence(FIRST_QUARTER, last)))
    items = timeline(quarter_data)
    report = {"sources": [source for _, source in quarter_data], "items": items,
              "decisions": FORMULATION_CHANGES}
    serialized = json.dumps(report, ensure_ascii=False, separators=(",", ":")) + "\n"
    if len(serialized.encode("utf-8")) > 4 * 1024 * 1024:
        raise ValueError("The history response would exceed its 4 MiB size budget.")
    output.write_text(serialized, encoding="utf-8")
    print(f"Combined {len(quarter_data)} quarters for {len(items):,} NDCs.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    manifest = json.loads((OUTPUT.parent / "manifest.json").read_text())
    parser.add_argument("--through", default=manifest["quarter"].replace(" ", "-"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--cached", action="store_true", help="Reuse downloaded ZIPs for local iteration")
    args = parser.parse_args()
    build(args.through, args.output, args.cached)
