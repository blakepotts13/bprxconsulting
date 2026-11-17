"""Package the private database into authenticated responses below Vercel's size limit."""
import hashlib,json
from pathlib import Path

CHUNK_BYTES=2*1024*1024

def package_database(directory):
    directory=Path(directory)
    data=(directory/'formulary.sqlite').read_bytes()
    manifest=json.loads((directory/'manifest.json').read_text())
    assert hashlib.sha256(data).hexdigest()==manifest['database_sha256']
    for stale in directory.glob('database-*.bin'):
        stale.unlink()
    chunks=[]
    for start in range(0,len(data),CHUNK_BYTES):
        part=data[start:start+CHUNK_BYTES]
        filename=f'database-{len(chunks)+1:02}.bin'
        (directory/filename).write_bytes(part)
        chunks.append({'file':filename,'bytes':len(part),'sha256':hashlib.sha256(part).hexdigest()})
    manifest['database_bytes']=len(data)
    manifest['database_chunks']=chunks
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (directory/'formulary.sqlite').unlink()
    print(f'Packaged {len(data)} database bytes in {len(chunks)} protected chunks.')

if __name__=='__main__':
    package_database(Path(__file__).resolve().parents[3]/'formulary-reference/assets')
