"""Collect native installers only after package inspection and launch checks pass."""
import hashlib, json, os, pathlib, shutil
root = pathlib.Path('.')
version = json.loads((root / 'package.json').read_text())['version']
target = os.environ['RELEASE_TARGET']
validation = root / 'artifacts/validation'
for name in ['package.json', 'launch.json']:
    assert json.loads((validation / name).read_text())['checksPassed'], name
out = root / 'artifacts/installers'
out.mkdir(parents=True, exist_ok=True)
files = []
for source in sorted((root / 'apps/planner/release').iterdir()):
    if source.is_file() and source.name.endswith(('.dmg', '.zip', '.exe', '.AppImage', '.deb')):
        shutil.copy2(source, out / source.name)
        files.append({'file': source.name, 'bytes': source.stat().st_size, 'sha256': hashlib.file_digest(source.open('rb'), 'sha256').hexdigest()})
assert len(files) >= 2, 'Expected both native installer and alternative package'
(out / f'{target}-assets.json').write_text(json.dumps({'version': version, 'target': target, 'commit': os.environ.get('GITHUB_SHA'), 'assets': files}, indent=2) + '\n')
print(json.dumps(files, indent=2))
