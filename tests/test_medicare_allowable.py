"""Validate rate ingestion independently of the live CMS download."""
import csv
import io
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/formulary-reference/scripts'))
from medicare_allowable import import_allowables, parse_amount


class AllowableImportTests(unittest.TestCase):
    def fixture(self, rates, restrictions=(), effective='Effective October 1, 2026 through December 31, 2026'):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / 'cms.zip'
        def csv_text(header, rows):
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([effective])
            writer.writerow(header)
            writer.writerows(rows)
            return output.getvalue()
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('Payment Limit File.csv', csv_text(
                ['HCPCS Code', 'HCPCS Code Dosage', 'Payment Limit', 'Notes'], rates))
            archive.writestr('Drugs Not Payable.csv', csv_text(
                ['HCPCS Code', 'Manufacturer'], restrictions))
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.execute('CREATE TABLE drugs(hcpcs TEXT)')
        db.executemany('INSERT INTO drugs VALUES(?)', [('J1756',), ('J1756',), ('J0001',), ('J0002',)])
        return db, path

    def test_exact_precision_missing_zero_and_restrictions_remain_distinct(self):
        db, path = self.fixture([
            ['J1756', '1 MG', '0.224', 'Source note'],
            ['J0001', '1 ML', 'N/A', 'Alternative methodology'],
            ['J0003', '1 MG', '0.000', ''],
            ['90371', '1 ML', '138.229', 'Numeric CPT excluded'],
        ], [['J0002', '\tManufacturer A ']])
        source, counts = import_allowables(db, path)
        rows = {row[0]: row[1:] for row in db.execute('SELECT * FROM medicare_allowables')}
        self.assertEqual(rows['J1756'], ('0.224', '1 MG', 'Source note', ''))
        self.assertIsNone(rows['J0001'][0])
        self.assertEqual(rows['J0003'][0], '0.000')
        self.assertEqual(rows['J0002'], (None, '', '', 'Manufacturer A'))
        self.assertNotIn('90371', rows)
        self.assertEqual(counts, {'allowable_hcpcs': 1, 'allowable_packages': 2, 'ndra_hcpcs': 1})
        self.assertEqual(source['quarter'], '2026 Q4')
        self.assertEqual(len(source['sha256']), 64)

    def test_duplicate_rate_fails_before_replacing_previous_snapshot(self):
        db, path = self.fixture([['J1756', '1 MG', '0.224', ''], ['J1756', '1 MG', '0.225', '']])
        db.execute('CREATE TABLE medicare_allowables(sentinel TEXT)')
        db.execute("INSERT INTO medicare_allowables VALUES('preserved')")
        with self.assertRaisesRegex(ValueError, 'Duplicate rate'):
            import_allowables(db, path)
        self.assertEqual(db.execute('SELECT * FROM medicare_allowables').fetchone(), ('preserved',))

    def test_wrong_quarter_is_rejected(self):
        db, path = self.fixture([['J1756', '1 MG', '0.224', '']], effective='Effective July 1, 2026 through September 30, 2026')
        with self.assertRaisesRegex(ValueError, 'Unexpected effective period'):
            import_allowables(db, path)

    def test_invalid_prices_never_become_zero_or_nonfinite_numbers(self):
        for value in ['NaN', 'Infinity', '-0.001', 'not a price']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_amount(value)
        self.assertIsNone(parse_amount('N/A'))
        self.assertIsNone(parse_amount(''))
        self.assertEqual(parse_amount('0.224'), '0.224')


if __name__ == '__main__':
    unittest.main()
