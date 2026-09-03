// Uploade history.json sur Vercel Blob avec un chemin stable (écrasé à chaque run).
// Usage : node upload_history.mjs <fichier_local> <chemin_dans_le_blob>
// Nécessite la variable d'env BLOB_READ_WRITE_TOKEN (token du store Vercel Blob).

import { put } from '@vercel/blob';
import { readFileSync } from 'node:fs';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error('❌ BLOB_READ_WRITE_TOKEN manquant dans l\'environnement.');
  process.exit(1);
}

const localFile = process.argv[2] || 'history.json';
const targetPath = process.argv[3] || 'history.json';

let data;
try {
  data = readFileSync(localFile);
} catch (err) {
  console.error(`❌ Impossible de lire ${localFile} :`, err.message);
  process.exit(1);
}

try {
  const blob = await put(targetPath, data, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
    // Ces fichiers ne changent qu'une fois par jour au plus : pas besoin que
    // le navigateur du visiteur en redemande une copie fraîche à chaque page.
    // Vercel Blob mettait 1 an par défaut pour un chemin stable écrasé — trop
    // long pour rester à jour ; no-store côté fetch() était l'autre extrême
    // (jamais de cache). 1h est un compromis raisonnable vu la cadence réelle.
    cacheControlMaxAge: 3600,
  });
  console.log('✅ Uploadé sur Vercel Blob :', blob.url);
} catch (err) {
  console.error('❌ Échec de l\'upload vers Vercel Blob :', err.message);
  process.exit(1);
}
