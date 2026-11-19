"""Build a review report from official CMS releases for two consecutive quarters."""
import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from openpyxl import load_workbook

CMS = "https://www.cms.gov"
SOURCES = {
    "hcpcs": (CMS + "/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update", "alpha-numeric hcpcs"),
    "crosswalk": (CMS + "/medicare/payment/part-b-drugs/asp-pricing-files", "ndc-hcpcs crosswalk"),
    "pricing": (CMS + "/medicare/payment/part-b-drugs/asp-pricing-files", "medicare part b payment limit file"),
    "opps": (CMS + "/medicare/payment/prospective-payment-systems/hospital-outpatient-pps/quarterly-addenda-updates", "addendum-b"),
}
LABELS = {
    "hcpcs": "HCPCS Level II",
    "crosswalk": "NDC-to-HCPCS and billing units",
    "pricing": "Medicare Allowable",
    "opps": "OPPS status",
}
CODE = re.compile(r"[A-Z][0-9]{4}")
QUARTER = re.compile(r"\d{4}-Q[1-4]")


def quarter_start(key):
    if not QUARTER.fullmatch(key):
        raise ValueError("Expected a quarter like 2027-Q1")
    return date(int(key[:4]), 1 + 3 * (int(key[-1]) - 1), 1)


def quarter_key(day):
    return f"{day.year}-Q{1 + (day.month - 1) // 3}"


def urls(page):
    response = requests.get(page, timeout=35)
    response.raise_for_status()
    return [
        (re.sub(r"[–—]", "-", anchor.get_text(" ", strip=True)), urljoin(page, anchor["href"]))
        for anchor in BeautifulSoup(response.content, "html.parser").find_all("a", href=True)
    ]


def cms_url(url):
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.netloc != "www.cms.gov":
        raise ValueError(f"Unexpected CMS URL: {url}")
    return url


def source_url(links, key, start):
    month = start.strftime("%B %Y").lower()
    pattern = SOURCES[key][1]
    matches = []
    for title, url in links:
        if not title.lower().startswith(month):
            continue
        if key == "opps":
            if not urlsplit(url).path.endswith("-addendum-b"):
                continue
        elif pattern not in title.lower() or not urlsplit(url).path.lower().endswith(".zip"):
            continue
        matches.append(cms_url(url))
    matches = list(dict.fromkeys(matches))
    if len(matches) > 1:
        raise ValueError(f"Multiple candidate CMS files for {key}, {month}")
    if not matches:
        return None
    if key != "opps":
        return matches[0]
    for title, url in urls(matches[0]):
        path = parse_qs(urlsplit(url).query).get("file", [url])[0]
        if "addendum b" in title.lower() and path.lower().endswith(".zip"):
            return cms_url(urljoin(CMS, path))
    raise ValueError(f"No OPPS ZIP on {matches[0]}")


def cell(value):
    return str(value).strip() if value is not None else ""


def workbook_rows(archive, name, required):
    book = load_workbook(io.BytesIO(archive.read(name)), read_only=True, data_only=True)
    try:
        yield from records(([cell(c) for c in row] for row in book.active.values), required)
    finally:
        book.close()


def records(rows, required):
    rows = iter(rows)
    header = next((row for row in rows if set(required) <= set(row)), None)
    if header is None:
        raise ValueError(f"Missing expected columns {required}")
    for row in rows:
        yield dict(zip(header, row))


def csv_rows(archive, name):
    raw = archive.read(name)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    return csv.reader(io.StringIO(text))


def active(code_date, start, *, termination=False):
    if not code_date or code_date in ("0", "00000000"):
        return True
    if not re.fullmatch(r"\d{8}", code_date):
        raise ValueError(f"Unexpected date in HCPCS file: {code_date}")
    return code_date >= start if termination else code_date <= start


def parse_hcpcs(archive, start):
    name, = [n for n in archive.namelist() if re.search(r"_ANWEB(?:_\d{8})?\.xlsx$", n, re.I)]
    found = {}
    for row in workbook_rows(archive, name, ["HCPC", "RECID", "LONG DESCRIPTION", "ADD DT", "TERM DT"]):
        code = row["HCPC"]
        if not CODE.fullmatch(code) or row["RECID"] != "3":
            continue
        if active(row["ADD DT"], start.strftime("%Y%m%d")) and active(row["TERM DT"], start.strftime("%Y%m%d"), termination=True):
            found[code] = row["LONG DESCRIPTION"]
    return found


def parse_crosswalk(archive):
    found = defaultdict(set)
    for name in archive.namelist():
        if not name.lower().endswith(".csv") or "introduction" in name.lower():
            continue
        rows = iter(csv_rows(archive, name))
        if not any(row and (row[0] == "HCPCS Code" or re.fullmatch(r"_20\d{2}_CODE", row[0])) for row in rows):
            raise ValueError(f"Missing crosswalk header in {name}")
        for row in rows:
            if len(row) >= 10 and CODE.fullmatch(row[0].strip()) and row[3].strip():
                code, _, _, ndc, drug, unit, size, quantity, per_item, per_package = map(str.strip, row[:10])
                info = f"{code} · {unit or 'Unit unspecified'} · {per_item or '—'} units/item · {per_package or '—'} units/pack · Qty {quantity or '—'} · Size {size or '—'}"
                found[ndc].add((code, drug, info))
    return {ndc: sorted(entry) for ndc, entry in found.items()}


def parse_pricing(archive, start):
    name, = [n for n in archive.namelist() if "payment limit file" in n.lower() and n.lower().endswith(".csv")]
    rows = list(csv_rows(archive, name))
    effective = start.strftime("%B") + f" {start.day}, {start.year}"
    if effective.lower() not in " ".join(" ".join(row) for row in rows[:10]).lower():
        raise ValueError(f"Unexpected pricing effective date: {name}")
    found = {}
    for row in records(rows, ["HCPCS Code", "Payment Limit", "HCPCS Code Dosage", "Notes"]):
        code = row["HCPCS Code"].strip()
        if CODE.fullmatch(code):
            amount, unit, note = [row[k].strip() for k in ("Payment Limit", "HCPCS Code Dosage", "Notes")]
            price = f"${amount} per {unit}" if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", amount) else "No numeric rate published"
            found[code] = f"{price} · {note}" if note else price
    return found


def parse_opps(archive):
    name, = [n for n in archive.namelist() if n.lower().endswith(".xlsx")]
    return {row["HCPCS Code"]: row["SI"] for row in workbook_rows(archive, name, ["HCPCS Code", "SI"])
            if CODE.fullmatch(row["HCPCS Code"])}


def load_dataset(key, url, start):
    response = requests.get(url, timeout=45)
    response.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        if key == "hcpcs":
            data = parse_hcpcs(archive, start)
        elif key == "crosswalk":
            data = parse_crosswalk(archive)
        elif key == "pricing":
            data = parse_pricing(archive, start)
        else:
            data = parse_opps(archive)
    if not data:
        raise ValueError(f"Empty {key} dataset from {url}")
    return data, hashlib.sha256(response.content).hexdigest()


def diff(key, prior, upcoming, relevant):
    changes = []
    for identifier in sorted(prior.keys() | upcoming.keys()):
        if key != "crosswalk" and identifier not in relevant and not identifier.startswith("J"):
            continue
        before, after = prior.get(identifier), upcoming.get(identifier)
        if key == "crosswalk":
            display = lambda entries: " | ".join(sorted({info for _, _, info in entries})) if entries else None
            label = " / ".join(sorted({drug for _, drug, _ in after or before if drug}))
            before, after = display(before), display(after)
        else:
            label = ""
        if before != after:
            changes.append({"id": identifier, "name": label, "before": before, "after": after})
    return changes


def generate(key):
    start = quarter_start(key)
    previous = quarter_start(quarter_key(start - timedelta(days=1)))
    cache = {page: urls(page) for page in dict.fromkeys(page for page, _ in SOURCES.values())}
    datasets, sources = {}, {}
    relevant = set()
    for kind, (page, _) in SOURCES.items():
        before, after = [source_url(cache[page], kind, day) for day in (previous, start)]
        sources[kind] = {"label": LABELS[kind], "page": page, "previous": before, "upcoming": after}
        if not after or not before:
            continue
        a, a_hash = load_dataset(kind, before, previous)
        b, b_hash = load_dataset(kind, after, start)
        datasets[kind] = a, b
        sources[kind].update(previousHash=a_hash, upcomingHash=b_hash)
        if kind == "crosswalk":
            relevant.update(code for data in (a, b) for entries in data.values() for code, _, _ in entries)
        elif kind == "pricing":
            relevant.update(a.keys() | b.keys())
    return {
        "quarter": key,
        "effective": start.isoformat(),
        "previousQuarter": quarter_key(previous),
        "sources": sources,
        "changes": {kind: diff(kind, *data, relevant) for kind, data in datasets.items()},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quarter", help="Default: the next quarter in Central Time")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    today = datetime.now(ZoneInfo("America/Chicago")).date()
    current = quarter_start(quarter_key(today))
    next_quarter = quarter_key(current + timedelta(days=100))
    keys = [args.quarter] if args.quarter else [next_quarter]
    if not args.quarter and (args.output / f"{quarter_key(current)}.json").is_file():
        keys.append(quarter_key(current))
    args.output.mkdir(parents=True, exist_ok=True)
    for key in keys:
        report = generate(key)
        output = args.output / f"{key}.json"
        if output.exists():
            prior = json.loads(output.read_text(encoding="utf-8"))
            removed = set(prior["changes"]) - set(report["changes"])
            if removed:
                raise ValueError(f"CMS comparisons became unavailable for {key}: {sorted(removed)}")
        output.write_text(json.dumps(report, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(key, {name: len(changes) for name, changes in report["changes"].items()})
