import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const config = Bun.file(join(root, '.nibrun.json'));
const nib = Bun.which('nib');
if (!nib) {
  throw new Error('Install the nibrun CLI and run nib login.');
}
async function run(command: string[]) {
  const child = Bun.spawn(command, {
    cwd: root,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await child.exited) !== 0) {
    throw new Error('Command failed.');
  }
}
const list = Bun.spawn([nib, '--json', 'apps', 'list'], { stdout: 'pipe', stderr: 'inherit' });
const output = await new Response(list.stdout).text();
if ((await list.exited) !== 0) {
  throw new Error('Run nib login first.');
}
const apps = JSON.parse(output).apps as { slug: string }[];
let slug: string | undefined = (await config.exists()) ? (await config.json()).slug : undefined;
if (!slug) {
  const matches = apps.filter((app) => app.slug.startsWith('content-use-'));
  if (matches.length > 1) {
    throw new Error('Multiple apps match. Set the exact slug in .nibrun.json.');
  }
  slug = matches[0]?.slug;
}
await run([process.execPath, 'run', 'build']);
await run([
  nib,
  'run',
  join(root, 'apps/backend/dist/content-use'),
  ...(slug ? ['--app', slug] : ['--name', 'content-use']),
  '--port',
  '3000',
]);
const latest = Bun.spawn([nib, '--json', 'apps', 'list'], { stdout: 'pipe' });
const result = JSON.parse(await new Response(latest.stdout).text());
await latest.exited;
const deployed =
  slug ?? result.apps.find((app: { slug: string }) => app.slug.startsWith('content-use-'))?.slug;
if (deployed) {
  await Bun.write(config, `${JSON.stringify({ slug: deployed }, null, 2)}\n`);
  console.log(`https://${deployed}.nibrun.app`);
}
