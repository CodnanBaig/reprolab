/** Parse every shipped browser and tooling module without installing packages. */
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function check(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = `${dir}/${entry.name}`;
        if (entry.isDirectory())
            await check(file);
        else if (/\.(?:js|mjs)$/.test(file)) {
            const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
            if (result.status !== 0)
                process.exit(result.status ?? 1);
        }
    }
}
for (const dir of ['public', 'extension', 'scripts'])
    await check(dir);
if (await readFile('public/sdk/reprolab.js', 'utf8') !== await readFile('extension/reprolab.js', 'utf8'))
    throw new Error('Extension recorder must match the SDK.');
console.log('Browser/module syntax and recorder parity passed.');
