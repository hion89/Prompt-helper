"""Create a clean Chrome Web Store ZIP using Python's standard library."""

import hashlib
import json
from pathlib import Path
import re
from datetime import datetime, timezone
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIRECTORIES = (
    'assets/icons', 'background', 'content', 'core', 'diagnostics',
    'evaluation', 'help', 'options', 'popup', 'providers', 'shared',
)
ALLOWED_SUFFIXES = {'.js', '.css', '.html', '.png'}
manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
assert manifest['version'] == package['version'], 'Manifest/package versions differ'
files = {'manifest.json': (ROOT / 'manifest.json').read_bytes()}
for directory in RUNTIME_DIRECTORIES:
    for source in sorted((ROOT / directory).rglob('*')):
        if source.is_dir():
            continue
        relative = source.relative_to(ROOT).as_posix()
        assert not source.is_symlink() and source.resolve().is_relative_to(ROOT), 'Unsafe path: ' + relative
        assert source.suffix in ALLOWED_SUFFIXES, 'Unexpected runtime file: ' + relative
        assert not any(part.startswith('.') for part in source.relative_to(ROOT).parts), 'Hidden file: ' + relative
        content = source.read_bytes()
        if source.suffix != '.png':
            text = content.decode('utf-8')
            assert not re.search(r'AIza[0-9A-Za-z_-]{30,}|\bsk-[0-9A-Za-z_-]{20,}', text), 'Possible credential: ' + relative
        files[relative] = content

references = [manifest['background']['service_worker'], manifest['action']['default_popup'],
              manifest['options_ui']['page'], *manifest['icons'].values(),
              *manifest['action']['default_icon'].values()]
for entry in manifest['content_scripts']:
    references.extend(entry['js'])
    references.extend(entry.get('css', []))
assert all(reference in files for reference in references), 'Missing manifest resource'
# Confirm imported modules are present in the ZIP as well as on disk.
for name, content in files.items():
    if not name.endswith('.js'):
        continue
    for imported in re.findall(r"(?:from\s+|import\s*)['\"](\.[^'\"]+)['\"]", content.decode('utf-8')):
        resolved = (ROOT / name).parent.joinpath(imported).resolve().relative_to(ROOT).as_posix()
        assert resolved in files, 'Missing import: ' + resolved

submission = ROOT / 'store-submission'
upload = submission / 'upload'
upload.mkdir(parents=True, exist_ok=True)
target = upload / ('prompt-optimizer-' + manifest['version'] + '.zip')
with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for name, content in sorted(files.items()):
        info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, content)
with ZipFile(target) as archive:
    assert archive.testzip() is None, 'ZIP CRC check failed'
    assert set(archive.namelist()) == set(files), 'ZIP entries differ'
    assert json.loads(archive.read('manifest.json'))['version'] == manifest['version']

(submission / 'PACKAGE-CONTENTS.txt').write_text('\n'.join(sorted(files)) + '\n', encoding='utf-8')
metadata_path = submission / 'submission-metadata.json'
metadata = json.loads(metadata_path.read_text(encoding='utf-8-sig')) if metadata_path.exists() else {}
metadata.update({
    'product': manifest['name'], 'version': manifest['version'],
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'package': 'upload/' + target.name, 'packageBytes': target.stat().st_size,
    'packageSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'manifestVersion': manifest['manifest_version'],
    'permissions': manifest['permissions'],
    'optionalHostPermissions': manifest['optional_host_permissions'],
    'packageFileCount': len(files),
    'validation': {'archiveStructure': 'passed', 'runtimeImports': 'passed',
                   'credentialPatternScan': 'passed', 'zipCrc': 'passed'},
})
metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'path': str(target), 'bytes': metadata['packageBytes'],
                  'files': len(files), 'sha256': metadata['packageSha256']}, ensure_ascii=False))
