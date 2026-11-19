"""Build the active CMS drug-code descriptor index for DailyMed matching."""
import argparse
from datetime import date
from io import BytesIO
import json
from pathlib import Path
import re
import sqlite3
from tempfile import NamedTemporaryFile
from zipfile import ZipFile

from openpyxl import load_workbook

assets = Path(__file__).resolve().parents[3] / "formulary-reference" / "assets"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path, help="CMS quarterly alphanumeric HCPCS ZIP")
parser.add_argument("source", help="CMS URL for the supplied ZIP")
args = parser.parse_args()
manifest = json.loads((assets / "manifest.json").read_text())
start = date.fromisoformat(manifest["quarter_start"]).strftime("%Y%m%d")
end = date.fromisoformat(manifest["quarter_end"]).strftime("%Y%m%d")

with ZipFile(args.archive) as archive:
    spreadsheet = next(name for name in archive.namelist() if re.search(r"_ANWEB_[0-9]+\.xlsx$", name))
    rows = load_workbook(BytesIO(archive.read(spreadsheet)), read_only=True, data_only=True).active.values
    columns = next(rows)
    code, kind, description, effective, term = (
        columns.index(name) for name in ("HCPC", "RECID", "LONG DESCRIPTION", "ACT EFF DT", "TERM DT")
    )
    codes = {
        record[code]: record[description] for record in rows
        if str(record[kind]) == "3" and re.fullmatch(r"[ACJPQ][0-9]{4}", str(record[code]))
        and (not record[effective] or str(record[effective]) <= end)
        and (not record[term] or str(record[term]) >= start)
    }

aliases = {}
with NamedTemporaryFile() as snapshot:
    for chunk in manifest["database_chunks"]:
        snapshot.write((assets / chunk["file"]).read_bytes())
    snapshot.flush()
    with sqlite3.connect(snapshot.name) as db:
        for hcpcs, name, description in db.execute("SELECT DISTINCT hcpcs, drug_name, description FROM drugs"):
            if hcpcs in codes:
                aliases.setdefault(hcpcs, set()).update(
                    term for term in (name, description) if term and term.lower() != codes[hcpcs].lower()
                )

output = {
    "source": args.source,
    "quarter": manifest["quarter"],
    "codes": [[code, description, sorted(aliases.get(code, ()))] for code, description in sorted(codes.items())],
}
(assets / "hcpcs-descriptors.json").write_text(json.dumps(output, separators=(",", ":")) + "\n")
print(f"Wrote {len(codes)} active HCPCS descriptions.")
