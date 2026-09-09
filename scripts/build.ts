import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = join(import.meta.dir, '..');
const frontend = join(root, 'apps/frontend/dist');
const generated = join(root, 'apps/backend/src/assets.gen.ts');
const files = await readdir(frontend, { recursive: true, withFileTypes: true });
const imports: string[] = [];
const entries: string[] = [];
for (const file of files) {
  if (!file.isFile()) {
    continue;
  }
  const path = join(file.parentPath, file.name);
  const index = imports.length;
  imports.push(`import asset${index} from ${JSON.stringify(path)} with { type: 'file' };`);
  entries.push(
    `[${JSON.stringify(`/${relative(frontend, path)}`)}, asset${index} as unknown as string]`,
  );
}
await writeFile(
  generated,
  `${imports.join('\n')}\nexport const assets = new Map<string,string>([${entries.join(',')}]);\n`,
);
await mkdir(join(root, 'apps/backend/dist'), { recursive: true });
const target = process.env.BUILD_TARGET === 'host' ? undefined : 'bun-linux-x64';
const result = await Bun.build({
  entrypoints: [join(root, 'apps/backend/src/main.ts')],
  compile: { outfile: join(root, 'apps/backend/dist/content-use'), ...(target ? { target } : {}) },
  target: 'bun',
  minify: true,
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
console.log('Built apps/backend/dist/content-use');
