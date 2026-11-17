"""Refresh only allowables while preserving the committed crosswalk/policy snapshot."""
import hashlib
import json
import sqlite3
import tempfile
from pathlib import Path
from medicare_allowable import import_allowables, update_manifest, START, END
from package_data import package_database

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parents[1] / 'formulary-reference/assets'


def refresh():
    manifest = json.loads((OUT / 'manifest.json').read_text())
    if manifest['quarter_start'] != START or manifest['quarter_end'] != END:
        raise ValueError('Pricing quarter must match the crosswalk snapshot')
    parts = []
    for chunk in manifest['database_chunks']:
        content = (OUT / chunk['file']).read_bytes()
        if hashlib.sha256(content).hexdigest() != chunk['sha256']:
            raise ValueError('Source database chunk failed integrity verification')
        parts.append(content)
    data = b''.join(parts)
    if hashlib.sha256(data).hexdigest() != manifest['database_sha256']:
        raise ValueError('Source database failed integrity verification')
    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / 'reference.sqlite'
        path.write_bytes(data)
        with sqlite3.connect(path) as db:
            source, counts = import_allowables(db, ROOT / 'sources/allowables.zip')
            update_manifest(manifest, source, counts)
            db.execute('UPDATE metadata SET value=? WHERE key=?', (json.dumps({key: value for key, value in manifest.items() if key not in ('database_sha256', 'database_bytes', 'database_chunks')}), 'manifest'))
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Updated database failed integrity verification')
        updated = path.read_bytes()
    manifest['database_sha256'] = hashlib.sha256(updated).hexdigest()
    (OUT / 'formulary.sqlite').write_bytes(updated)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    package_database(OUT)
    print(json.dumps(counts))


if __name__ == '__main__':
    refresh()
