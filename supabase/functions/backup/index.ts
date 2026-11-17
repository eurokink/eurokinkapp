// EuroKink — sauvegarde hebdomadaire vers un dépôt GitHub PRIVÉ.
// Exporte toutes les tables (sans mots de passe), les comptes (e-mail, dates) et les images (logos, photos).
// Secrets : GITHUB_BACKUP_TOKEN (jeton GitHub limité au dépôt, saisi par l'administrateur), GITHUB_BACKUP_REPO (facultatif).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REPO = Deno.env.get('GITHUB_BACKUP_REPO') || 'eurokink/eurokink-sauvegardes';
const TOKEN = Deno.env.get('GITHUB_BACKUP_TOKEN') || '';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const gh = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'eurokink-backup', ...(init.headers || {}) },
  });
  const body = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, body };
};
const b64 = (u8: Uint8Array) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
async function gitSha(u8: Uint8Array) {
  const head = new TextEncoder().encode(`blob ${u8.length}\0`);
  const all = new Uint8Array(head.length + u8.length); all.set(head); all.set(u8, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const README = `# Sauvegardes EuroKink (dépôt privé)

Une sauvegarde complète est ajoutée automatiquement chaque semaine (nuit du dimanche au lundi).
Chaque sauvegarde est un commit : l'historique permet de revenir à n'importe quelle semaine.

## Contenu
- \`data/<table>.json\` : le contenu de chaque table de la base (soirées, organisateurs, membres, messages, avis, dons…).
- \`data/_auth_users.json\` : les comptes (identifiant, e-mail, dates). **Aucun mot de passe** : après une restauration, les membres utilisent « Mot de passe oublié ».
- \`storage/<bucket>/…\` : les images (logos des organisateurs, photos de profil, affiches).
- \`manifest.json\` : date de la sauvegarde et nombre de lignes par table.

## Restaurer
1. Dans un projet Supabase (l'actuel ou un nouveau), recréer la structure : migrations du dossier \`supabase/\` du dépôt de l'appli, ou demander à Claude de la reconstruire.
2. Recréer les comptes à partir de \`data/_auth_users.json\` (mêmes identifiants), puis importer les tables dans l'ordre des dépendances (organizers, venues, profiles, events, puis le reste).
3. Renvoyer les images de \`storage/\` dans les buckets du même nom (event-images, avatars).
4. Vérifier l'appli, puis prévenir les membres de réinitialiser leur mot de passe si les comptes ont été recréés.

En cas de besoin, demande simplement à Claude : « restaure la sauvegarde EuroKink du <date> ».
`;

Deno.serve(async () => {
  const log = async (ok: boolean, detail: string) => { await sb.from('backup_runs').insert({ ok, detail: detail.slice(0, 2000) }); };
  try {
    if (!TOKEN) throw new Error('Secret GITHUB_BACKUP_TOKEN manquant');
    // Garde-fou : une seule sauvegarde réussie par tranche de 12 h
    const { data: last } = await sb.from('backup_runs').select('ran_at').eq('ok', true).order('ran_at', { ascending: false }).limit(1);
    if (last && last[0] && Date.now() - new Date(last[0].ran_at).getTime() < 12 * 3600e3) {
      return Response.json({ skipped: 'sauvegarde déjà faite il y a moins de 12 h' });
    }
    const { data: dump, error } = await sb.rpc('backup_export');
    if (error) throw new Error('Export : ' + error.message);
    const { data: objects, error: e2 } = await sb.rpc('backup_storage_list');
    if (e2) throw new Error('Liste des images : ' + e2.message);

    // Dépôt vide : on l'initialise avec le README
    let ref = await gh('/git/ref/heads/main');
    if (ref.status !== 200) {
      const init = await gh('/contents/README.md', { method: 'PUT', body: JSON.stringify({ message: 'Initialisation', content: b64(new TextEncoder().encode(README)), branch: 'main' }) });
      if (init.status >= 300) throw new Error(`GitHub (init ${init.status}) : ${JSON.stringify(init.body).slice(0, 300)}`);
      ref = await gh('/git/ref/heads/main');
    }
    const headSha = ref.body.object.sha;
    const headCommit = await gh(`/git/commits/${headSha}`);
    const oldTree = await gh(`/git/trees/${headCommit.body.tree.sha}?recursive=1`);
    const existing = new Map<string, string>((oldTree.body.tree || []).filter((x: any) => x.type === 'blob').map((x: any) => [x.path, x.sha]));

    const files: { path: string; data: Uint8Array }[] = [];
    const enc = new TextEncoder();
    const counts: Record<string, number> = {};
    for (const [table, rows] of Object.entries(dump as Record<string, unknown[]>)) {
      counts[table] = rows.length;
      files.push({ path: `data/${table}.json`, data: enc.encode(JSON.stringify(rows, null, 1)) });
    }
    let images = 0;
    for (const o of objects as { bucket: string; name: string }[]) {
      const { data: blob, error: e3 } = await sb.storage.from(o.bucket).download(o.name);
      if (e3 || !blob) continue;
      files.push({ path: `storage/${o.bucket}/${o.name}`, data: new Uint8Array(await blob.arrayBuffer()) });
      images += 1;
    }
    const now = new Date().toISOString();
    files.push({ path: 'manifest.json', data: enc.encode(JSON.stringify({ date: now, tables: counts, images }, null, 2)) });
    files.push({ path: 'README.md', data: enc.encode(README) });

    const tree: any[] = [];
    const keep = new Set<string>();
    for (const f of files) {
      keep.add(f.path);
      const sha = await gitSha(f.data);
      if (existing.get(f.path) === sha) continue;
      const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(f.data), encoding: 'base64' }) });
      if (blob.status >= 300) throw new Error(`GitHub (blob ${blob.status}) : ${JSON.stringify(blob.body).slice(0, 300)}`);
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.body.sha });
    }
    // Fichiers disparus (image supprimée, table supprimée) : retirés de la dernière version, gardés dans l'historique
    for (const p of existing.keys()) if (!keep.has(p)) tree.push({ path: p, mode: '100644', type: 'blob', sha: null });
    if (!tree.length) { await log(true, 'aucun changement'); return Response.json({ ok: true, unchanged: true }); }

    const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: headCommit.body.tree.sha, tree }) });
    if (newTree.status >= 300) throw new Error(`GitHub (tree ${newTree.status}) : ${JSON.stringify(newTree.body).slice(0, 300)}`);
    const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: `Sauvegarde du ${now.slice(0, 10)}`, tree: newTree.body.sha, parents: [headSha] }) });
    if (commit.status >= 300) throw new Error(`GitHub (commit ${commit.status}) : ${JSON.stringify(commit.body).slice(0, 300)}`);
    const upd = await gh('/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: commit.body.sha }) });
    if (upd.status >= 300) throw new Error(`GitHub (ref ${upd.status}) : ${JSON.stringify(upd.body).slice(0, 300)}`);
    const msg = `${Object.keys(counts).length} tables, ${images} images, ${tree.length} fichiers modifiés`;
    await log(true, msg);
    return Response.json({ ok: true, detail: msg });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await log(false, m);
    return Response.json({ ok: false, error: m }, { status: 500 });
  }
});
