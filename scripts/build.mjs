import { stripTypeScriptTypes } from 'node:module';
import { readdir, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/src', { recursive: true });
for (const file of await readdir('src'))
    if (file.endsWith('.ts')) {
        const input = await readFile(`src/${file}`, 'utf8');
        const output = stripTypeScriptTypes(input, { mode: 'strip' }).replace(/(from\s+['"]\.[^'"]+)\.ts(['"])/g, '$1.js$2');
        await writeFile(path.join('dist/src', file.replace(/\.ts$/, '.js')), output);
    }
await cp('public', 'dist/public', { recursive: true });
console.log('Built TypeScript server + browser application into dist/. No runtime packages required.');
