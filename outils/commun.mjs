// Fonctions partagées par les outils en ligne de commande (Node ≥ 18, sans dépendance).

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliser } from '../assets/rendu.js';

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

export function lireJSON(chemin) {
  return JSON.parse(readFileSync(chemin, 'utf8'));
}

export function ecrireJSON(chemin, valeur) {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`);
}

export function listeMatieres() {
  return lireJSON(join(RACINE, 'matieres.json')).matieres;
}

/** Trouve une matière par identifiant, alias ou nom (sans tenir compte des accents ni de la casse). */
export function trouverMatiere(argument) {
  const liste = listeMatieres();
  const cherche = normaliser(argument);
  const noms = (m) => [m.slug, m.nom, ...(m.alias ?? [])].map(normaliser);
  const exactes = liste.filter((m) => noms(m).includes(cherche));
  if (exactes.length === 1) return exactes[0];
  const partielles = liste.filter((m) => noms(m).some((n) => n.includes(cherche)));
  if (partielles.length === 1) return partielles[0];
  const toutes = liste.map((m) => `${m.slug} (${[m.nom, ...(m.alias ?? [])].join(', ')})`).join('\n  ');
  if (partielles.length > 1) {
    throw new Error(`« ${argument} » est ambigu : ${partielles.map((m) => m.slug).join(', ')}.`);
  }
  throw new Error(`Matière inconnue : « ${argument} ». Matières disponibles :\n  ${toutes}`);
}

export function dossierMatiere(matiere) {
  return join(RACINE, matiere.slug);
}

export function sha256(chemin) {
  return createHash('sha256').update(readFileSync(chemin)).digest('hex');
}

/** Fichiers de notes d'une matière (chemins relatifs au dossier de la matière, ex. « notes/cm3.pdf »). */
export function fichiersNotes(dossier) {
  const res = [];
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const chemin = join(d, e.name);
      if (e.isDirectory()) parcourir(chemin);
      else if (e.isFile()) res.push(relative(dossier, chemin).split(sep).join('/'));
    }
  };
  if (existsSync(join(dossier, 'notes'))) parcourir(join(dossier, 'notes'));
  return res.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

export function lireRegistre(dossier) {
  const chemin = join(dossier, 'notes-traitees.json');
  return existsSync(chemin) ? lireJSON(chemin) : {};
}

export function ecrireRegistre(dossier, registre) {
  const trie = Object.fromEntries(Object.keys(registre).sort().map((k) => [k, registre[k]]));
  ecrireJSON(join(dossier, 'notes-traitees.json'), trie);
}

/**
 * Compare le dossier notes/ au registre :
 *   nouvelles   jamais traitées
 *   modifiees   traitées, mais le fichier a changé depuis
 *   renommees   même contenu qu'une note traitée dont le nom a disparu
 *   supprimees  au registre, mais plus dans le dossier
 */
export function etatNotes(dossier) {
  const registre = lireRegistre(dossier);
  const empreintes = new Map(fichiersNotes(dossier).map((f) => [f, sha256(join(dossier, f))]));
  const absentes = Object.keys(registre).filter((f) => !empreintes.has(f));
  const res = { nouvelles: [], modifiees: [], renommees: [], supprimees: [], inchangees: [] };
  for (const [fichier, empreinte] of empreintes) {
    const entree = registre[fichier];
    if (!entree) {
      const ancien = absentes.find(
        (a) => registre[a].sha256 === empreinte && !res.renommees.some((r) => r.ancien === a),
      );
      if (ancien) res.renommees.push({ fichier, ancien, ...registre[ancien] });
      else res.nouvelles.push(fichier);
    } else if (entree.sha256 !== empreinte) {
      res.modifiees.push({ fichier, ...entree });
    } else {
      res.inchangees.push(fichier);
    }
  }
  res.supprimees = absentes
    .filter((a) => !res.renommees.some((r) => r.ancien === a))
    .map((a) => ({ fichier: a, ...registre[a] }));
  return res;
}

export function aujourdhui() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const echapperHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Page d'une matière : une coquille identique pour toutes, seul l'identifiant change. */
export function pageMatiere(slug, nom) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <title>${echapperHTML(nom)} — Révisions</title>
  <link rel="stylesheet" href="../assets/vendor/katex/katex.min.css">
  <meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#16181c" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="../assets/icone.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="../assets/icone-180.png">
  <link rel="stylesheet" href="../assets/style.css">
  <script defer src="../assets/vendor/katex/katex.min.js"></script>
  <script type="module" src="../assets/app.js"></script>
</head>
<body data-page="matiere" data-matiere="${echapperHTML(slug)}">
  <main id="contenu" class="page">
    <p class="chargement">Chargement…</p>
  </main>
  <script>
    if (location.protocol === 'file:') {
      document.getElementById('contenu').innerHTML =
        '<div class="erreur"><p><strong>Ce site doit être ouvert via un serveur web.</strong></p>' +
        '<p>Les navigateurs bloquent la lecture des fiches quand on ouvre le fichier directement. ' +
        'En local : lance <code>python3 -m http.server</code> à la racine du dépôt, puis ouvre ' +
        '<code>http://localhost:8000</code>. En ligne : GitHub Pages.</p></div>';
    }
  </script>
  <script nomodule>
    document.getElementById('contenu').innerHTML = '<div class="erreur"><p>Navigateur trop ancien pour ce site.</p></div>';
  </script>
</body>
</html>
`;
}
