"""Import the published CMS quarterly amounts without recalculating ASP or add-ons."""
import csv
import hashlib
import io
import json
import re
import zipfile
from decimal import Decimal, InvalidOperation

URL = 'https://www.cms.gov/files/zip/october-2026-medicare-part-b-payment-limit-files-final.zip'
QUARTER = '2026 Q4'
START = '2026-10-01'
END = '2026-12-31'
EFFECTIVE = 'effective october 1, 2026 through december 31, 2026'


def source_rows(archive, name, required):
    text = archive.read(name).decode('cp1252')
    if EFFECTIVE not in text.lower():
        raise ValueError(f'Unexpected effective period in {name}')
    rows = list(csv.reader(io.StringIO(text)))
    header = next(i for i, row in enumerate(rows) if row and row[0].strip() == 'HCPCS Code')
    columns = [column.strip() for column in rows[header]]
    if not set(required).issubset(columns):
        raise ValueError(f'Missing required columns in {name}')
    return [dict(zip(columns, row)) for row in rows[header + 1:]
            if row and re.fullmatch(r'[A-Z][0-9]{4}', row[0].strip())]


def parse_amount(value):
    text = value.strip()
    if text in ('', 'N/A'):
        return None
    try:
        amount = Decimal(text)
    except InvalidOperation as error:
        raise ValueError(f'Invalid CMS amount: {text}') from error
    if not amount.is_finite() or amount < 0:
        raise ValueError(f'Invalid CMS amount: {text}')
    return text  # Keep the source's decimal precision, including genuine zeroes.


def import_allowables(db, source_path):
    content = source_path.read_bytes()
    records = {}
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        rate_files = [name for name in archive.namelist() if name.endswith('.csv') and 'Payment Limit File' in name]
        restriction_files = [name for name in archive.namelist() if name.endswith('.csv') and 'Drugs Not Payable' in name]
        if len(rate_files) != 1 or len(restriction_files) != 1:
            raise ValueError('Expected one rate file and one NDRA restriction file')
        rate_file, restriction_file = rate_files[0], restriction_files[0]
        rates = source_rows(archive, rate_file, ['HCPCS Code', 'HCPCS Code Dosage', 'Payment Limit', 'Notes'])
        restrictions = source_rows(archive, restriction_file, ['HCPCS Code', 'Manufacturer'])
        if not rates:
            raise ValueError('CMS rate file contains no applicable HCPCS rows')
        for row in rates:
            code = row['HCPCS Code'].strip()
            if code in records:
                raise ValueError(f'Duplicate rate for {code}')
            records[code] = [parse_amount(row['Payment Limit']), row['HCPCS Code Dosage'].strip(), row['Notes'].strip(), []]
        for row in restrictions:
            code = row['HCPCS Code'].strip()
            entry = records.setdefault(code, [None, '', '', []])
            entry[3].append(row['Manufacturer'].strip())
    # Parsing must finish successfully before replacing a previous snapshot.
    db.execute('DROP TABLE IF EXISTS medicare_allowables')
    db.execute('CREATE TABLE medicare_allowables(hcpcs TEXT PRIMARY KEY,amount_text TEXT,billing_unit TEXT,notes TEXT,ndra_manufacturers TEXT)')
    db.executemany('INSERT INTO medicare_allowables VALUES(?,?,?,?,?)',
                   [(code, *values[:3], '; '.join(sorted(set(values[3])))) for code, values in records.items()])
    counts = {
        'allowable_hcpcs': db.execute('SELECT COUNT(DISTINCT d.hcpcs) FROM drugs d JOIN medicare_allowables a ON a.hcpcs=d.hcpcs WHERE a.amount_text IS NOT NULL').fetchone()[0],
        'allowable_packages': db.execute('SELECT COUNT(*) FROM drugs d JOIN medicare_allowables a ON a.hcpcs=d.hcpcs WHERE a.amount_text IS NOT NULL').fetchone()[0],
        'ndra_hcpcs': db.execute("SELECT COUNT(DISTINCT d.hcpcs) FROM drugs d JOIN medicare_allowables a ON a.hcpcs=d.hcpcs WHERE a.ndra_manufacturers<>''").fetchone()[0],
    }
    source = {'url': URL, 'effective': START, 'effective_end': END, 'quarter': QUARTER,
              'sha256': hashlib.sha256(content).hexdigest(), 'rate_file': rate_file,
              'restriction_file': restriction_file, 'rate_hcpcs': len(rates),
              'restriction_rows': len(restrictions)}
    return source, counts


def update_manifest(manifest, source, counts):
    if manifest['quarter_start'] != source['effective'] or manifest['quarter_end'] != source['effective_end']:
        raise ValueError('Pricing quarter must match the crosswalk snapshot')
    manifest['sources']['allowables'] = source
    manifest['counts'].update(counts)
    note = 'Medicare Allowable is the published quarterly CMS Part B amount per HCPCS billing unit, including applicable add-ons; it is not raw ASP or a guarantee of coverage, acquisition cost, or CAH reimbursement. Source notes and manufacturer-specific NDRA restrictions must be reviewed.'
    if note not in manifest['limitations']:
        manifest['limitations'].append(note)
    return manifest
