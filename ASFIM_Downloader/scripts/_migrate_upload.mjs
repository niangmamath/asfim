// Migration ponctuelle : upload en masse de blob_out/ vers Vercel Blob, avec
// une petite concurrence pour ne pas prendre des heures sur ~460 fichiers.
// Script temporaire, pas destiné à être committé.
import { put } from '@vercel/blob';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN manquant.');
  process.exit(1);
}

const root = process.argv[2] || '../blob_out';

function walk(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files = files.concat(walk(full));
    else files.push(full);
  }
  return files;
}

const files = walk(root).map(f => ({
  local: f,
  target: relative(root, f).split('\\').join('/'),
}));

console.log(`${files.length} fichier(s) à uploader.`);

const CONCURRENCY = 12;
let done = 0;
let failed = 0;

async function uploadOne({ local, target }) {
  const data = readFileSync(local);
  try {
    await put(target, data, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
      cacheControlMaxAge: 3600,
    });
    done++;
    if (done % 50 === 0) console.log(`${done}/${files.length}...`);
  } catch (err) {
    failed++;
    console.error(`Echec ${target} :`, err.message);
  }
}

async function pool(items, worker, concurrency) {
  const queue = [...items];
  const runners = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(runners);
}

await pool(files, uploadOne, CONCURRENCY);
console.log(`Terminé : ${done} ok, ${failed} échec(s).`);
if (failed > 0) process.exit(1);
