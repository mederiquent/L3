#!/usr/bin/env node
// Crée le squelette d'une matière et l'ajoute à matieres.json.
//
//   node outils/nouvelle-matiere.mjs <identifiant> "<Nom affiché>" [--alias a,b,c]
//   node outils/nouvelle-matiere.mjs --regenerer     réécrit la page index.html de chaque matière
//
// <identifiant> : minuscules, chiffres et tirets (sert de nom de dossier et d'adresse).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ecrireJSON, lireJSON, pageMatiere, RACINE } from './commun.mjs';

const args = process.argv.slice(2);

function regenerer() {
  for (const m of lireJSON(join(RACINE, 'matieres.json')).matieres) {
    writeFileSync(join(RACINE, m.slug, 'index.html'), pageMatiere(m.slug, m.nom));
    console.log(`Régénérée : ${m.slug}/index.html`);
  }
}

function creer(slug, nom, alias) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug ?? '')) {
    throw new Error('Identifiant invalide : minuscules, chiffres et tirets uniquement (ex. « theorie-des-jeux »).');
  }
  if (!nom) throw new Error('Nom affiché manquant.');
  const cheminListe = join(RACINE, 'matieres.json');
  const liste = lireJSON(cheminListe);
  if (liste.matieres.some((m) => m.slug === slug)) throw new Error(`La matière « ${slug} » existe déjà dans matieres.json.`);
  const dossier = join(RACINE, slug);
  if (existsSync(dossier)) throw new Error(`Le dossier ${slug}/ existe déjà.`);

  mkdirSync(join(dossier, 'notes'), { recursive: true });
  writeFileSync(join(dossier, 'notes', '.gitkeep'), '');
  writeFileSync(join(dossier, 'index.html'), pageMatiere(slug, nom));
  ecrireJSON(join(dossier, 'matiere.json'), { seances: [] });
  ecrireJSON(join(dossier, 'notes-traitees.json'), {});
  writeFileSync(
    join(dossier, 'questions.md'),
    `# Questions — ${nom}\n\n` +
      `Questions posées avec \`/question ${slug} …\`, dans l'ordre chronologique (le site affiche les plus récentes en premier).\n`,
  );
  liste.matieres.push({ slug, nom, ...(alias.length ? { alias } : {}) });
  ecrireJSON(cheminListe, liste);
  console.log(`Matière créée : ${slug}/ (${nom})${alias.length ? ` — alias : ${alias.join(', ')}` : ''}`);
}

try {
  if (args[0] === '--regenerer') {
    regenerer();
  } else {
    const i = args.indexOf('--alias');
    const alias = i >= 0 ? (args[i + 1] ?? '').split(',').map((a) => a.trim()).filter(Boolean) : [];
    const positionnels = i >= 0 ? args.slice(0, i) : args;
    creer(positionnels[0], positionnels[1], alias);
  }
} catch (erreur) {
  console.error(`Erreur : ${erreur.message}`);
  process.exit(1);
}
