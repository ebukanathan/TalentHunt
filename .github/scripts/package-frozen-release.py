"""Package only runtime inputs from the fresh frozen checkout; never deploy."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile

APPROVED = '26f6f5119f3424f484f962c98d10af0de8be9773'
source, output = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
metadata = json.loads((source / 'BUILD_METADATA.json').read_text())
assert metadata['sourceCommit'] == APPROVED
assert metadata['node'] == 'v24.22.3' and metadata['platform'] == 'linux' and metadata['architecture'] == 'x64'
assert metadata['prismaNativeEngineLoaded'] and metadata['sharpWebpRoundTripPassed']
assert metadata['productionSecretsUsed'] is False
epoch = int(subprocess.check_output(['git', 'show', '-s', '--format=%ct', APPROVED], cwd=source, text=True))
roots = ['package.json', 'package-lock.json', 'prisma/schema.prisma',
         'apps/api/package.json', 'apps/api/dist', 'apps/web/package.json',
         'apps/web/next.config.ts', 'apps/web/next-env.d.ts', 'apps/web/tsconfig.json',
         'apps/web/src', 'apps/web/public', 'apps/web/.next', 'node_modules',
         'RELEASE_SHA', 'BUILD_METADATA.json']
excluded_parts = {'.git', '.secrets', 'artifacts', 'backups', '__tests__', 'test', 'tests',
                  'fixtures', 'examples', 'benchmark', 'benchmarks', '__pycache__'}
excluded_names = {'.npmrc', '.netrc', 'id_rsa', 'id_ed25519', '.DS_Store'}
excluded_suffixes = {'.pem', '.key', '.p12', '.pfx', '.dump', '.bak', '.sqlite', '.db'}
private_key = re.compile(rb'-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{32,}-----END')
live_key = re.compile(rb'\bsk_live_[A-Za-z0-9]{20,}\b')

def allowed(rel):
    return (not any(p in excluded_parts for p in rel.parts)
            and not rel.name.startswith('.env') and rel.name not in excluded_names
            and rel.suffix.lower() not in excluded_suffixes
            and not str(rel).startswith('apps/web/.next/cache/'))

def digest_file(file):
    h = hashlib.sha256()
    for block in iter(lambda: file.read(1024 * 1024), b''):
        h.update(block)
    return h.hexdigest()

entries = set()
for root in roots:
    p = source / root
    assert p.exists(), 'Missing runtime input: ' + root
    for parent in p.parents:
        if parent == source:
            break
        entries.add(parent.relative_to(source))
    pending = [p]
    while pending:
        p = pending.pop()
        rel = p.relative_to(source)
        if not allowed(rel):
            continue
        entries.add(rel)
        if p.is_dir() and not p.is_symlink():
            pending.extend(p.iterdir())

records = []
for rel in sorted(entries):
    p = source / rel
    if p.is_symlink():
        target = os.readlink(p)
        assert not os.path.isabs(target)
        resolved = (p.parent / target).resolve()
        assert resolved.is_relative_to(source), 'External symlink'
        assert resolved.relative_to(source) in entries, 'Runtime symlink target omitted'
        records.append({'file': str(rel), 'symlink': target})
    elif p.is_file():
        # Fresh checkout and no private workflow inputs are the primary boundary.
        # Also reject concrete live keys/private-key blocks before archive creation.
        previous = b''
        with p.open('rb') as f:
            for b in iter(lambda: f.read(1024 * 1024), b''):
                content = previous + b
                assert not private_key.search(content) and not live_key.search(content), 'Credential-like content rejected'
                previous = content[-16384:]
        with p.open('rb') as f:
            records.append({'file': str(rel), 'bytes': p.stat().st_size, 'sha256': digest_file(f)})

archive = output / ('talenthunt-' + APPROVED + '-linux-x64.tar.gz')
with archive.open('wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as zipped, tarfile.open(fileobj=zipped, mode='w', format=tarfile.PAX_FORMAT) as tar:
    for rel in sorted(entries):
        p = source / rel
        info = tar.gettarinfo(str(p), arcname=str(rel))
        info.uid = info.gid = 0
        info.uname = info.gname = ''
        info.mtime = epoch
        info.pax_headers = {}
        info.mode = 0o755 if info.isdir() or (p.stat().st_mode & 0o111) else 0o644
        if info.isfile():
            with p.open('rb') as f:
                tar.addfile(info, f)
        else:
            tar.addfile(info)

# Verify the archive, not merely the pre-archive directory.
expected = {r['file']: r for r in records}
with tempfile.TemporaryDirectory(prefix='talenthunt-artifact-verify-') as temp:
    unpacked = Path(temp)
    with tarfile.open(archive, 'r:gz') as tar:
        for m in tar:
            rel = Path(m.name)
            assert not rel.is_absolute() and '..' not in rel.parts and allowed(rel)
            if m.isfile():
                assert digest_file(tar.extractfile(m)) == expected[m.name]['sha256']
            elif m.issym():
                assert m.linkname == expected[m.name]['symlink']
            else:
                assert m.isdir()
        tar.extractall(unpacked, filter='data')
    verify_js = r"""
const path=require('node:path');
const base=process.cwd(),{PrismaClient}=require(path.join(base,'node_modules/@prisma/client')),sharp=require(path.join(base,'node_modules/sharp'));
(async()=>{const db=new PrismaClient({datasources:{db:{url:'postgresql://unused:unused@127.0.0.1:1/unused?connect_timeout=2'}}});let code;
try{await db.$connect();}catch(e){code=e.errorCode;}finally{await db.$disconnect();}
if(code!=='P1001')throw Error('Extracted Prisma engine failed');
const b=await sharp({create:{width:2,height:2,channels:3,background:'#777'}}).webp().toBuffer();
if((await sharp(b).metadata()).format!=='webp')throw Error('Extracted Sharp failed');
require(path.join(base,'node_modules/next/package.json'));
console.log('EXTRACTED_NATIVE_DEPENDENCIES_PASSED');
})().catch(()=>{console.error('Extracted runtime verification failed');process.exitCode=1;});
"""
    subprocess.run(['node', '-e', verify_js], cwd=unpacked, check=True)

with archive.open('rb') as f:
    archive_hash = digest_file(f)
manifest = {'status': 'PASS', 'sourceCommit': APPROVED, 'toolingCommit': metadata['toolingCommit'],
            'archive': archive.name, 'archiveSha256': archive_hash, 'archiveBytes': archive.stat().st_size,
            'files': records, 'buildMetadata': metadata, 'extractedNativeDependenciesPassed': True,
            'archiveChecksumsVerified': True, 'productionSecretsUsed': False,
            'exclusions': 'Fresh source checkout; runtime allowlist; no VCS, environment files, credentials, backups, test fixtures, QA output or build cache.'}
(output / 'linux-release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(output / 'BUILD_METADATA.json').write_text(json.dumps(metadata, indent=2) + '\n')
lines = []
for p in [archive, output / 'linux-release-manifest.json', output / 'BUILD_METADATA.json']:
    with p.open('rb') as f:
        lines.append(digest_file(f) + '  ' + p.name)
(output / 'SHA256SUMS').write_text('\n'.join(lines) + '\n')
print(json.dumps({'status': 'PASS', 'archive': archive.name, 'archiveSha256': archive_hash,
                  'archiveBytes': archive.stat().st_size, 'manifestFiles': len(records)}))
