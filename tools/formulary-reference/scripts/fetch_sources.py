from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests,zipfile,io,json,hashlib,argparse
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'sources').mkdir(parents=True,exist_ok=True)
SOURCES={
'crosswalk':('https://www.cms.gov/files/zip/october-2026-ndc-hcpcs-crosswalk-final.zip','2026-10-01'),
'allowables':('https://www.cms.gov/files/zip/october-2026-medicare-part-b-payment-limit-files-final.zip','2026-10-01'),
'opps':('https://www.cms.gov/files/zip/October-2026-OPPS-Addendum-B.zip','2026-10-01'),
'articles':('https://downloads.cms.gov/medicare-coverage-database/downloads/exports/current_article.zip','2026-11-08')}
def fetch(item):
 key,(url,asof)=item
 path=ROOT/'sources'/f'{key}.zip'
 if not path.exists():
  r=requests.get(url,timeout=90);r.raise_for_status();path.write_bytes(r.content)
 z=zipfile.ZipFile(path)
 print(key,path.stat().st_size, z.namelist(),flush=True)
 (ROOT/'sources'/f'{key}-manifest.json').write_text(json.dumps({'url':url,'effective':asof,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()},indent=2))
 for n in z.namelist():
  if n.lower().endswith(('.csv','.xlsx','.xls','.txt')):
   dest=ROOT/'sources'/key/Path(n).name;dest.parent.mkdir(exist_ok=True);dest.write_bytes(z.read(n))
  elif n.lower().endswith('_csv.zip'):
   inner=zipfile.ZipFile(io.BytesIO(z.read(n)))
   for filename in inner.namelist():
    if filename.lower().endswith('.csv'):
     dest=ROOT/'sources'/key/Path(filename).name;dest.parent.mkdir(exist_ok=True);dest.write_bytes(inner.read(filename))
parser=argparse.ArgumentParser(description='Download official CMS source snapshots')
parser.add_argument('--only',choices=list(SOURCES))
parser.add_argument('--refresh',action='store_true',help='Redownload the selected source(s) instead of reusing cached files')
args=parser.parse_args()
items=[(args.only,SOURCES[args.only])] if args.only else list(SOURCES.items())
if args.refresh:
 for key,_ in items:(ROOT/'sources'/f'{key}.zip').unlink(missing_ok=True)
with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(fetch,items))
