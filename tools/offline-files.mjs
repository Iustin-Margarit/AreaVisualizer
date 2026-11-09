// Lists every file the site needs, for sw.js to keep for offline use: offline-files.json.
// node tools/offline-files.mjs     (a test says when it's out of date)
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FOLDERS = ['css', 'js', 'vendor', 'assets'];
const SINGLE = ['manifest.webmanifest'];

const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

export const offlineFiles = () => [...SINGLE, ...FOLDERS.flatMap(folder => walk(join(ROOT, folder)))
  .map(path => relative(ROOT, path).split(sep).join('/'))].sort();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(join(ROOT, 'offline-files.json'), `${JSON.stringify(offlineFiles(), null, 0).replaceAll('","', '",\n"')}\n`);
  console.log(`listed ${offlineFiles().length} files`);
}
