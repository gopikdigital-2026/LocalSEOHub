import { build, version } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'auditoria-a2/gbp02-fix02d/evidence');
await mkdir(output, { recursive: true });
const slugs = ['gbp-list-locations', 'gbp-recover-attempt', 'gbp-oauth-start', 'gbp-sync', 'gbp-disconnect', 'gbp-reviews', 'gbp-oauth-callback'];
const results = [];
for (const slug of slugs) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [`supabase/functions/${slug}/index.ts`],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    external: ['npm:*', 'jsr:*', 'https://*'],
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const sharedContract = Object.keys(result.metafile.inputs).includes('supabase/functions/activeBusiness.ts');
  if (slug !== 'gbp-oauth-callback' && !sharedContract) throw new Error(`Shared contract missing: ${slug}`);
  await writeFile(resolve(output, `edge-${slug}.json`), JSON.stringify(result.metafile, null, 2));
  results.push({ slug, localGraph: 'PASS', sharedContract, externalImports: result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].imports });
}
console.log(JSON.stringify({ esbuild: version, runtime: process.version, localGraph: results, supabaseEdgePackaging: 'NOT VERIFIED', reason: 'Only local graph bundling; npm/jsr imports external; no deployment or Supabase runtime validation.' }, null, 2));
