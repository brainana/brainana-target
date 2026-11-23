"""Assemble a complete release from all four successful native builds."""
import hashlib, json, os, pathlib, shutil, subprocess, zipfile
root = pathlib.Path('.')
version = json.loads((root / 'package.json').read_text())['version']
out = root / 'release-output'
expected = ['macos-arm64', 'macos-x64', 'windows-x64', 'linux-x64']
assets = []
for target in expected:
    manifest = json.loads((out / f'{target}-assets.json').read_text())
    assert manifest['version'] == version and manifest['commit'] == os.environ['GITHUB_SHA']
    for item in manifest['assets']:
        file = out / item['file']
        assert file.stat().st_size == item['bytes']
        assert hashlib.file_digest(file.open('rb'), 'sha256').hexdigest() == item['sha256']
        assets.append({**item, 'target': target})
source = out / f'brainana-target-{version}-source.zip'
subprocess.run(['git', 'archive', '--format=zip', f'--prefix=brainana-target-{version}/', '-o', str(source), 'HEAD'], check=True)
shutil.copytree('Documentation', out / 'Documentation', dirs_exist_ok=True)
for name in ['README.md', 'README-FIRST.md', 'LICENSE', 'NOTICE.txt', 'VERSION.json']:
    shutil.copy2(name, out / name)
(out / 'RELEASE_ASSETS.json').write_text(json.dumps({'version': version, 'status': 'early alpha', 'commit': os.environ['GITHUB_SHA'], 'assets': assets}, indent=2) + '\n')
files = sorted(file for file in out.rglob('*') if file.is_file())
checksums = ''.join(f"{hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()}  {file.relative_to(out).as_posix()}\n" for file in files)
(out / 'SHA256SUMS.txt').write_text(checksums)
full = out / f'brainana-target-{version}-full-release.zip'
with zipfile.ZipFile(full, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in [*files, out / 'SHA256SUMS.txt']:
        archive.write(file, file.relative_to(out).as_posix())
with (out / 'SHA256SUMS.txt').open('a') as stream:
    stream.write(f"{hashlib.file_digest(full.open('rb'), 'sha256').hexdigest()}  {full.name}\n")
print(f'Complete early-alpha release: {len(assets)} installers/packages plus source, documentation and validation')
