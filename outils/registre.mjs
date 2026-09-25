#!/usr/bin/env node
// Registre des notes traitées (<matière>/notes-traitees.json) : chaque note y est
// enregistrée avec son empreinte SHA-256, la date de traitement et la ou les séances
// qu'elle alimente. Une note nouvelle, modifiée ou renommée est ainsi repérée.
//
//   node outils/registre.mjs                                   état de toutes les matières
//   node outils/registre.mjs <matière>                         notes à traiter dans une matière
//   node outils/registre.mjs <matière> --marquer <séance>[,<séance>…] <fichier>…
//   node outils/registre.mjs <matière> --oublier <fichier>…
//
// <matière> : identifiant, alias ou nom (ex. « optim », « probas »).
// <fichier> : « notes/x.pdf », « <matière>/notes/x.pdf » ou simplement « x.pdf ».

import { existsSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  aujourdhui,
  dossierMatiere,
  ecrireRegistre,
  etatNotes,
  fichiersNotes,
  lireJSON,
  lireRegistre,
  listeMatieres,
  sha256,
  trouverMatiere,
} from './commun.mjs';

const [argMatiere, action, ...reste] = process.argv.slice(2);

function resumer(e) {
  const aTraiter = e.nouvelles.length + e.modifiees.length + e.renommees.length;
  const details = [
    e.nouvelles.length && `${e.nouvelles.length} nouvelle(s)`,
    e.modifiees.length && `${e.modifiees.length} modifiée(s)`,
    e.renommees.length && `${e.renommees.length} renommée(s)`,
    e.supprimees.length && `${e.supprimees.length} supprimée(s)`,
  ].filter(Boolean);
  return aTraiter || e.supprimees.length ? details.join(', ') : 'à jour';
}

function afficherEtat(m) {
  const e = etatNotes(dossierMatiere(m));
  console.log(`Matière : ${m.nom} [${m.slug}] — notes dans ${m.slug}/notes/`);
  const lignes = [
    ...e.nouvelles.map((f) => `  NOUVELLE   ${f}`),
    ...e.modifiees.map((x) => `  MODIFIÉE   ${x.fichier}   (traitée le ${x.traitee_le} pour ${x.seances.join(', ')})`),
    ...e.renommees.map((x) => `  RENOMMÉE   ${x.fichier}   (ancien nom : ${x.ancien}, séance ${x.seances.join(', ')})`),
  ];
  if (lignes.length) console.log(`À traiter :\n${lignes.join('\n')}`);
  if (e.supprimees.length) {
    console.log('Disparues du dossier, toujours au registre :');
    for (const x of e.supprimees) console.log(`  SUPPRIMÉE  ${x.fichier}   (séance ${x.seances.join(', ')})`);
  }
  if (!lignes.length && !e.supprimees.length) {
    console.log(`Rien à traiter (${e.inchangees.length} note(s) déjà traitée(s), inchangée(s)).`);
  } else {
    console.log(`Déjà traitées et inchangées : ${e.inchangees.length}`);
  }
}

function cheminNote(m, argument, doitExister = true) {
  const dossier = dossierMatiere(m);
  const candidats = [resolve(argument), join(dossier, argument), join(dossier, 'notes', argument)];
  for (const c of candidats) {
    if (existsSync(c) && statSync(c).isFile()) {
      const rel = relative(dossier, c).split(sep).join('/');
      if (!rel.startsWith('notes/')) throw new Error(`${argument} n'est pas dans ${m.slug}/notes/.`);
      return rel;
    }
  }
  if (!doitExister) {
    const registre = lireRegistre(dossier);
    const cles = [argument, argument.replace(new RegExp(`^${m.slug}/`), ''), `notes/${argument}`];
    const cle = cles.find((k) => k in registre);
    if (cle) return cle;
  }
  throw new Error(`Note introuvable : ${argument} (dans ${m.slug}/notes/ : ${fichiersNotes(dossier).join(', ') || 'aucune note'}).`);
}

function marquer(m, seancesArg, fichiers) {
  if (!seancesArg || !fichiers.length) throw new Error('Usage : --marquer <séance>[,<séance>…] <fichier>…');
  const dossier = dossierMatiere(m);
  const seances = seancesArg.split(',').map((s) => s.trim()).filter(Boolean);
  const connues = new Set((lireJSON(join(dossier, 'matiere.json')).seances ?? []).map((s) => s.id));
  const inconnues = seances.filter((s) => !connues.has(s));
  if (inconnues.length) {
    throw new Error(`Séance(s) absente(s) de ${m.slug}/matiere.json : ${inconnues.join(', ')}. Ajoute-les avant de marquer les notes.`);
  }
  const registre = lireRegistre(dossier);
  for (const f of fichiers) {
    const cle = cheminNote(m, f);
    const avant = registre[cle]?.seances ?? [];
    registre[cle] = {
      sha256: sha256(join(dossier, cle)),
      traitee_le: aujourdhui(),
      seances: [...new Set([...avant, ...seances])].sort(),
    };
    console.log(`Marquée : ${cle} → ${registre[cle].seances.join(', ')}`);
  }
  ecrireRegistre(dossier, registre);
}

function oublier(m, fichiers) {
  if (!fichiers.length) throw new Error('Usage : --oublier <fichier>…');
  const dossier = dossierMatiere(m);
  const registre = lireRegistre(dossier);
  for (const f of fichiers) {
    const cle = cheminNote(m, f, false);
    if (!(cle in registre)) throw new Error(`${cle} n'est pas au registre.`);
    delete registre[cle];
    console.log(`Retirée du registre : ${cle}`);
  }
  ecrireRegistre(dossier, registre);
}

try {
  if (!argMatiere) {
    const liste = listeMatieres();
    const largeur = Math.max(...liste.map((m) => m.slug.length));
    for (const m of liste) {
      const notes = fichiersNotes(dossierMatiere(m)).length;
      console.log(`${m.slug.padEnd(largeur)}  ${resumer(etatNotes(dossierMatiere(m)))}   (${notes} note(s) dans le dossier)`);
    }
  } else {
    const m = trouverMatiere(argMatiere);
    if (!action) afficherEtat(m);
    else if (action === '--marquer') marquer(m, reste[0], reste.slice(1));
    else if (action === '--oublier') oublier(m, reste);
    else throw new Error(`Option inconnue : ${action} (attendu : --marquer ou --oublier).`);
  }
} catch (erreur) {
  console.error(`Erreur : ${erreur.message}`);
  process.exit(1);
}
