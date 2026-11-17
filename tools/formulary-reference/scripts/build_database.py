"""Rebuild a read-only SQLite reference from cached official CMS source files."""
import csv,json,re,sqlite3,zipfile,io,hashlib
from pathlib import Path
from datetime import date
from medicare_allowable import import_allowables, update_manifest
import pandas as pd
from bs4 import BeautifulSoup
csv.field_size_limit(20_000_000)
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT.parents[1]/'formulary-reference/assets'; ASOF='2026-11-16'
# A complete snapshot refresh is explicit; never silently substitute an older quarter.
def read(name):
 return csv.DictReader((ROOT/'sources/articles'/f'{name}.csv').open(encoding='utf-8-sig'))
def plain(v):return BeautifulSoup(v or '', 'html.parser').get_text(' ',strip=True)
def active(v):return not v or v[:10]>=ASOF
path=OUT/'formulary.sqlite';path.unlink(missing_ok=True)
db=sqlite3.connect(path)
db.executescript('''
CREATE TABLE drugs(id INTEGER PRIMARY KEY,ndc TEXT,ndc_display TEXT,drug_name TEXT,description TEXT,hcpcs TEXT,dosage TEXT,labeler TEXT,package_size TEXT,package_qty TEXT,units_item REAL,units_ndc REAL,si TEXT,source TEXT);
CREATE INDEX drugs_ndc ON drugs(ndc); CREATE INDEX drugs_hcpcs ON drugs(hcpcs);
CREATE TABLE policies(id TEXT PRIMARY KEY,version TEXT,title TEXT,effective TEXT,updated TEXT,part_a INTEGER,part_b INTEGER,cah_listed INTEGER);
CREATE TABLE policy_contractors(policy_id TEXT,contractor_id TEXT,contractor_type_id TEXT,contractor_version TEXT,name TEXT,number TEXT,contract_type TEXT,states TEXT,status TEXT,PRIMARY KEY(policy_id,contractor_id,contractor_type_id,contractor_version));
CREATE TABLE policy_hcpcs(policy_id TEXT,hcpcs TEXT,group_no TEXT,PRIMARY KEY(policy_id,hcpcs,group_no));
CREATE INDEX ph_hcpcs ON policy_hcpcs(hcpcs);
CREATE TABLE diagnosis(policy_id TEXT,group_no TEXT,code TEXT,normalized TEXT,description TEXT,sort_order INTEGER,asterisk TEXT,PRIMARY KEY(policy_id,group_no,code));
CREATE INDEX dx_normalized ON diagnosis(normalized); CREATE INDEX dx_policy ON diagnosis(policy_id);
CREATE TABLE policy_groups(policy_id TEXT,kind TEXT,group_no TEXT,note TEXT,PRIMARY KEY(policy_id,kind,group_no));
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
''')
oppsfile=next((ROOT/'sources/opps').glob('*.xlsx')); raw=pd.read_excel(oppsfile,header=None,dtype=str).fillna('')
header=next(i for i,row in raw.iterrows() if row.iloc[0]=='HCPCS Code')
opps=pd.read_excel(oppsfile,header=header,dtype=str).fillna('')
sis={str(k).strip():str(v).strip() for k,v in zip(opps['HCPCS Code'],opps['SI'])}
seen={};excluded=0
for f in sorted((ROOT/'sources/crosswalk').glob('*.csv')):
 if 'Introduction' in f.name:continue
 lines=f.read_text(encoding='cp1252').splitlines()
 hi=next(i for i,s in enumerate(lines) if s.startswith(('HCPCS Code,','_2026_CODE,')))
 for row in csv.reader(lines[hi+1:]):
  if len(row)<10:continue
  code,desc,labeler,ndc,name,dosage,size,qty,units,total=[x.strip() for x in row[:10]]
  if not re.fullmatch('[A-Z][0-9]{4}',code):excluded+=1;continue
  norm=re.sub('[^0-9]','',ndc) if re.fullmatch(r'\d{5}-\d{4}-\d{2}',ndc) else ndc
  try:u=float(units);t=float(total)
  except ValueError:u=t=None
  key=(code,ndc,name,dosage,size,qty,units,total)
  source=f.name
  if key in seen:seen[key]['sources'].append(source);continue
  seen[key]={'row':(norm,ndc,name,desc,code,dosage,labeler,size,qty,u,t,sis.get(code,'')),'sources':[source]}
for entry in seen.values():db.execute('INSERT INTO drugs(ndc,ndc_display,drug_name,description,hcpcs,dosage,labeler,package_size,package_qty,units_item,units_ndc,si,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(*entry['row'],json.dumps(entry['sources'])))
codes={r[0] for r in db.execute('SELECT DISTINCT hcpcs FROM drugs')}
def contractor_key(r):return (r['contractor_id'],r['contractor_type_id'],r['contractor_version'])
contractors={contractor_key(r):r for r in read('contractor')}
types={r['contractor_type_id']:r['description'] for r in read('contractor_type_lookup')}
states={r['state_id']:r['state_abbrev'] for r in read('state_lookup')}
jurisdictions={}
for r in read('contractor_jurisdiction'):
 if r['active_date'][:10]<=ASOF and active(r['term_date']):
  jurisdictions.setdefault(contractor_key(r),set()).add(states.get(r['state_id'],r['state_id']))
scopes={};article_contractors={}
for r in read('article_x_contractor'):
 article_key=(r['article_id'],r['article_version']);ck=contractor_key(r)
 article_contractors.setdefault(article_key,set()).add(ck)
 contractor=contractors.get(ck,{})
 if contractor.get('contractor_number') in ['06101','06102'] and contractor.get('status')=='A':
  scopes.setdefault(article_key,set()).add('a' if contractor['contractor_number']=='06101' else 'b')
relevant={(r['article_id'],r['article_version']) for r in read('article_x_hcpc_code') if r['hcpc_code_id'] in codes}
cah={r['article_id'] for r in read('article_x_bill_code') if r['bill_code_id'].startswith('085')}
keys=set();future=0
for r in read('article'):
 key=(r['article_id'],r['article_version'])
 if key not in relevant:continue
 if r['status']!='A' or r['article_eff_date'][:10]>ASOF or not all(active(r[k]) for k in ['article_end_date','article_rev_end_date','date_retired']):future+=1;continue
 parts=scopes.get(key,set());keys.add(key)
 db.execute('INSERT INTO policies VALUES(?,?,?,?,?,?,?,?)',(r['article_id'],r['article_version'],r['title'],r['article_eff_date'][:10],r['last_updated'][:10],int('a' in parts),int('b' in parts),int(r['article_id'] in cah)))
 for ck in sorted(article_contractors.get(key,set())):
  con=contractors.get(ck)
  if con:
   db.execute('INSERT INTO policy_contractors VALUES(?,?,?,?,?,?,?,?,?)',(r['article_id'],*ck,con['contractor_bus_name'],con['contractor_number'],types.get(con['contractor_type_id'],con['contractor_type_id']),', '.join(sorted(jurisdictions.get(ck,set()))),con['status']))
for r in read('article_x_hcpc_code'):
 if (r['article_id'],r['article_version']) in keys and r['hcpc_code_id'] in codes:
  db.execute('INSERT OR IGNORE INTO policy_hcpcs VALUES(?,?,?)',(r['article_id'],r['hcpc_code_id'],r['hcpc_code_group']))
for r in read('article_x_icd10_covered'):
 if (r['article_id'],r['article_version']) in keys:
  db.execute('INSERT OR IGNORE INTO diagnosis VALUES(?,?,?,?,?,?,?)',(r['article_id'],r['icd10_covered_group'],r['icd10_code_id'],r['icd10_code_id'].replace('.',''),r['description'],int(r['sort_order'] or 0),r['asterisk']))
for kind,filename,groupcol in [('hcpcs','article_x_hcpc_code_group','hcpc_code_group'),('icd','article_x_icd10_covered_group','icd10_covered_group')]:
 for r in read(filename):
  if (r['article_id'],r['article_version']) in keys:
   db.execute('INSERT OR REPLACE INTO policy_groups VALUES(?,?,?,?)',(r['article_id'],kind,r[groupcol],plain(r['paragraph'])))
counts={key:db.execute(sql).fetchone()[0] for key,sql in {'records':'SELECT COUNT(*) FROM drugs','ndcs':'SELECT COUNT(DISTINCT ndc) FROM drugs','hcpcs':'SELECT COUNT(DISTINCT hcpcs) FROM drugs','policies':'SELECT COUNT(*) FROM policies','diagnoses':'SELECT COUNT(*) FROM diagnosis','codes_with_policy':'SELECT COUNT(DISTINCT hcpcs) FROM policy_hcpcs','ngs_policies':'SELECT COUNT(*) FROM policies WHERE part_a=1 OR part_b=1','other_policies':'SELECT COUNT(*) FROM policies WHERE part_a=0 AND part_b=0','codes_with_diagnoses':'SELECT COUNT(DISTINCT hcpcs) FROM policy_hcpcs ph WHERE EXISTS(SELECT 1 FROM diagnosis dx WHERE dx.policy_id=ph.policy_id)','ngs_codes_with_diagnoses':'SELECT COUNT(DISTINCT ph.hcpcs) FROM policy_hcpcs ph JOIN policies p ON p.id=ph.policy_id WHERE (p.part_a=1 OR p.part_b=1) AND EXISTS(SELECT 1 FROM diagnosis dx WHERE dx.policy_id=p.id)'}.items()}
meta={'as_of':ASOF,'quarter':'2026 Q4','quarter_start':'2026-10-01','quarter_end':'2026-12-31','policy_snapshot':'2026-11-08','policy_release':'2026-11-12','opps_revision':'2026-10-15','scope':'NGS J6 Illinois default (06101 / 06102); other Medicare contractors reference only','counts':counts,'excluded_numeric_cpt_rows':excluded,'excluded_inactive_future_policies':future,'sources':{key:json.loads((ROOT/'sources'/f'{key}-manifest.json').read_text()) for key in ['crosswalk','opps','articles']},'limitations':['CMS crosswalks are not a complete US drug directory.','ICD-10 matches are article-level co-listings, not a validated drug-diagnosis crosswalk or coverage approval.','Diagnosis and HCPCS group numbers are retained independently; their numbers do not establish a relationship.','Current downloaded Medicare contractor articles listing mapped HCPCS are indexed. NGS J6 Illinois is the default; other-contractor articles are reference only and do not establish Illinois coverage. NCDs, Medicaid and commercial policies are not included.','Latest-version download can omit an earlier in-effect version when a future revision exists.','G/K/N are OPPS indicators; CAH payment and drug waste eligibility cannot be inferred from these letters.','Numeric CPT rows and CPT descriptors are excluded from this free-source reference.','Updates require rebuilding and redeploying; no automatic refresh is configured.']}
allowable_source, allowable_counts = import_allowables(db, ROOT/'sources/allowables.zip')
update_manifest(meta, allowable_source, allowable_counts)
db.execute('INSERT INTO metadata VALUES(?,?)',('manifest',json.dumps(meta)));db.commit();db.execute('VACUUM');db.close()
meta['database_sha256']=hashlib.sha256(path.read_bytes()).hexdigest();(OUT/'manifest.json').write_text(json.dumps(meta,indent=2))
print(json.dumps(meta,indent=2));print('Database bytes',path.stat().st_size)

from package_data import package_database
package_database(OUT)
