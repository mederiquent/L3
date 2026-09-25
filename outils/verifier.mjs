#!/usr/bin/env node
// Vérifie tout le site avant un commit ; code de sortie 1 s'il reste une erreur.
//
//   node outils/verifier.mjs
//
// Contrôles : JSON (matières, séances, registre), présence des trois fiches par séance,
// compilation de chaque formule par KaTeX (même moteur que le site), liens vers des
// fichiers existants, rubriques de la fiche vigilance, structure des quiz, renvois **Vn**.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  analyserQuestions,
  analyserQuiz,
  analyserVigilance,
  creerMoteur,
  fichierSeance,
  normaliser,
  renvoisV,
  titrePrincipal,
  TYPES_FICHES,
} from '../assets/rendu.js';
import { etatNotes, fichiersNotes, lireJSON, pageMatiere, RACINE } from './commun.mjs';

const katex = createRequire(import.meta.url)('../assets/vendor/katex/katex.min.js');
const moteur = creerMoteur(katex);

const erreurs = [];
const avertissements = [];
const infos = [];

const nom = (chemin) => relative(RACINE, chemin) || '.';
const lieu = (chemin, ligne) => `${nom(chemin)}${ligne ? `:${ligne}` : ''}`;
const erreur = (chemin, message, ligne) => erreurs.push(`${lieu(chemin, ligne)} — ${message}`);
const avertir = (chemin, message, ligne) => avertissements.push(`${lieu(chemin, ligne)} — ${message}`);
const extrait = (s) => (s.length > 70 ? `${s.slice(0, 67)}…` : s).replace(/\s+/g, ' ');

function ligneDe(texte, morceau) {
  const premiere = String(morceau ?? '').split('\n')[0].trim();
  if (!premiere) return undefined;
  const i = texte.indexOf(premiere);
  return i < 0 ? undefined : texte.slice(0, i).split('\n').length;
}

function lireJSONVerifie(chemin) {
  if (!existsSync(chemin)) {
    erreur(chemin, 'fichier absent');
    return null;
  }
  try {
    return lireJSON(chemin);
  } catch (e) {
    erreur(chemin, `JSON invalide : ${e.message}`);
    return null;
  }
}

function dateValide(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, j] = s.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

// ---------------------------------------------------------------- Markdown

function verifierMarkdown(chemin, md) {
  moteur.rendre(md, {
    base: pathToFileURL(chemin).href,
    surErreurTex: (tex, e) =>
      erreur(chemin, `LaTeX : ${e.message.replace(/^KaTeX parse error: /, '')}  [${extrait(tex)}]`, ligneDe(md, tex)),
    surAvertTex: (tex, message) => avertir(chemin, `LaTeX : ${message}  [${extrait(tex)}]`, ligneDe(md, tex)),
    surLien: (href, cible) => {
      if (!cible.startsWith('file:')) return;
      const url = new URL(cible);
      url.hash = '';
      url.search = '';
      const fichier = fileURLToPath(url);
      if (!existsSync(fichier)) erreur(chemin, `lien cassé : ${href}`, ligneDe(md, href));
      else if (fichier.endsWith('.md')) {
        avertir(chemin, `lien vers un fichier .md (${href}) : sur le site, préférer un renvoi **Vn** ou « #<séance>/<onglet> »`, ligneDe(md, href));
      }
    },
  });
  moteur.parcourir(moteur.lexer(md), (token) => {
    if (token.type === 'text' && !token.tokens && /\$/.test(token.text)) {
      avertir(chemin, `« $ » isolé : formule mal fermée ? (écrire \\$ pour un dollar)  [${extrait(token.raw)}]`, ligneDe(md, token.raw));
    }
    if (token.type === 'escape' && (token.raw === '\\(' || token.raw === '\\[')) {
      avertir(chemin, 'délimiteurs \\( \\) ou \\[ \\] non reconnus : utiliser $…$ ou $$…$$', ligneDe(md, token.raw));
    }
    if (token.type === 'html' && token.text.trim() && !token.text.trim().startsWith('<!--')) {
      avertir(chemin, `HTML brut : ${extrait(token.text.trim())}`, ligneDe(md, token.raw));
    }
  });
}

// ---------------------------------------------------------------- séances

function verifierSeance(dossier, s) {
  const textes = {};
  const chemin = (t) => join(dossier, fichierSeance(s, t));
  for (const t of TYPES_FICHES) {
    if (!existsSync(chemin(t))) {
      erreur(chemin(t), `fiche ${t} absente`);
      continue;
    }
    textes[t] = readFileSync(chemin(t), 'utf8');
    verifierMarkdown(chemin(t), textes[t]);
    if (!titrePrincipal(textes[t])) avertir(chemin(t), 'pas de titre « # … » en tête de fiche');
  }

  const numerosV = new Set();
  if (textes.vigilance !== undefined) {
    const v = analyserVigilance(textes.vigilance);
    for (const r of v.manquantes) erreur(chemin('vigilance'), `rubrique manquante : « ## ${r} »`);
    for (const p of v.problemes) erreur(chemin('vigilance'), p);
    for (const p of v.points) {
      if (numerosV.has(p.numero)) erreur(chemin('vigilance'), `point V${p.numero} en double`, p.ligne);
      numerosV.add(p.numero);
    }
  }
  for (const t of TYPES_FICHES) {
    if (textes[t] === undefined) continue;
    for (const r of renvoisV(textes[t])) {
      if (!numerosV.has(r.numero)) {
        erreur(chemin(t), `renvoi **V${r.numero}** sans point V${r.numero} dans la fiche vigilance`, r.ligne);
      }
    }
  }

  if (textes.quiz !== undefined) {
    const quiz = analyserQuiz(textes.quiz);
    if (!quiz.questions.length) erreur(chemin('quiz'), 'aucune question (une section « ## Q1 » par question)');
    else if (quiz.questions.length < 5) avertir(chemin('quiz'), `seulement ${quiz.questions.length} question(s)`);
    for (const q of quiz.questions) for (const p of q.problemes) erreur(chemin('quiz'), `${q.titre} : ${p}`, q.ligne);
  }

  if (textes.cours !== undefined && !/^## +À retenir\s*$/im.test(textes.cours)) {
    avertir(chemin('cours'), 'pas de section « ## À retenir »');
  }
}

// ---------------------------------------------------------------- matières

function verifierMatiere(m, cheminListe) {
  const dossier = join(RACINE, m.slug);
  if (!existsSync(dossier)) {
    erreur(cheminListe, `dossier ${m.slug}/ absent (node outils/nouvelle-matiere.mjs)`);
    return;
  }

  const page = join(dossier, 'index.html');
  if (!existsSync(page)) erreur(page, 'page absente (node outils/nouvelle-matiere.mjs --regenerer)');
  else if (readFileSync(page, 'utf8') !== pageMatiere(m.slug, m.nom)) {
    avertir(page, 'page différente du modèle (node outils/nouvelle-matiere.mjs --regenerer)');
  }
  if (!existsSync(join(dossier, 'notes'))) erreur(dossier, 'dossier notes/ absent');

  const cheminMatiere = join(dossier, 'matiere.json');
  const matiere = lireJSONVerifie(cheminMatiere);
  if (matiere && !Array.isArray(matiere.seances)) erreur(cheminMatiere, '« seances » doit être une liste');
  const seances = Array.isArray(matiere?.seances) ? matiere.seances : [];

  const cheminRegistre = join(dossier, 'notes-traitees.json');
  const registre = lireJSONVerifie(cheminRegistre) ?? {};
  const notes = new Set(fichiersNotes(dossier));
  const ids = new Set();

  for (const s of seances) {
    const quoi = `séance ${s.id ?? '?'}`;
    if (!/^[a-z]+\d{2}$/.test(s.id ?? '')) erreur(cheminMatiere, `${quoi} : identifiant invalide (attendu : cm01, td02, s03…)`);
    if (ids.has(s.id)) erreur(cheminMatiere, `${quoi} : identifiant en double`);
    ids.add(s.id);
    if (s.date == null) avertir(cheminMatiere, `${quoi} : date du cours inconnue`);
    else if (!dateValide(s.date)) erreur(cheminMatiere, `${quoi} : date invalide « ${s.date} » (AAAA-MM-JJ, ou null)`);
    for (const champ of ['titre', 'libelle']) {
      const v = s[champ];
      if (v === undefined && champ === 'libelle') continue;
      if (typeof v !== 'string' || !v.trim()) erreur(cheminMatiere, `${quoi} : ${champ} manquant`);
      else if (/[\u0000-\u001f]/.test(v)) erreur(cheminMatiere, `${quoi} : caractère de contrôle dans ${champ} (LaTeX mal échappé ?)`);
      else if (/[\\$]/.test(v)) erreur(cheminMatiere, `${quoi} : pas de LaTeX dans le ${champ} (écrire en Unicode : σ, ≤, ℝ…)`);
    }
    if (!Array.isArray(s.sources) || !s.sources.length) erreur(cheminMatiere, `${quoi} : aucune note source`);
    for (const src of s.sources ?? []) {
      if (!src.startsWith('notes/')) erreur(cheminMatiere, `${quoi} : source hors de notes/ : ${src}`);
      else if (!notes.has(src)) erreur(cheminMatiere, `${quoi} : note source introuvable : ${src}`);
      else if (!registre[src]) avertir(cheminMatiere, `${quoi} : ${src} absente du registre (outils/registre.mjs --marquer)`);
    }
    verifierSeance(dossier, s);
  }

  const dossierSeances = join(dossier, 'seances');
  if (existsSync(dossierSeances)) {
    for (const f of readdirSync(dossierSeances)) {
      if (f.startsWith('.')) continue;
      const mm = /^([a-z]+\d{2})-(cours|vigilance|quiz)\.md$/.exec(f);
      if (!mm) avertir(join(dossierSeances, f), 'fichier inattendu dans seances/');
      else if (!ids.has(mm[1])) avertir(join(dossierSeances, f), `fiche d'une séance absente de matiere.json (${mm[1]})`);
    }
  }

  for (const [f, e] of Object.entries(registre)) {
    if (!/^[0-9a-f]{64}$/.test(e?.sha256 ?? '')) erreur(cheminRegistre, `${f} : empreinte invalide`);
    for (const id of e?.seances ?? []) if (!ids.has(id)) avertir(cheminRegistre, `${f} : séance ${id} absente de matiere.json`);
  }

  const cheminQuestions = join(dossier, 'questions.md');
  let nbQuestions = 0;
  if (!existsSync(cheminQuestions)) erreur(cheminQuestions, 'fichier absent');
  else {
    const md = readFileSync(cheminQuestions, 'utf8');
    verifierMarkdown(cheminQuestions, md);
    const questions = analyserQuestions(md);
    nbQuestions = questions.length;
    for (const q of questions) {
      if (!q.corps) erreur(cheminQuestions, `question sans réponse : « ${extrait(q.titre)} »`, q.ligne);
      if (!q.meta) avertir(cheminQuestions, `question sans ligne « *date · séance* » : « ${extrait(q.titre)} »`, q.ligne);
    }
  }

  const etat = etatNotes(dossier);
  const attente = etat.nouvelles.length + etat.modifiees.length + etat.renommees.length;
  const resume = `${m.slug} : ${seances.length} séance(s), ${nbQuestions} question(s), ${notes.size} note(s)`;
  infos.push(attente ? `${resume} — ${attente} note(s) à traiter (node outils/registre.mjs ${m.slug})` : resume);
  if (etat.supprimees.length) infos.push(`${m.slug} : ${etat.supprimees.length} note(s) du registre absente(s) du dossier notes/`);
}

// ---------------------------------------------------------------- lancement

const cheminListe = join(RACINE, 'matieres.json');
const liste = lireJSONVerifie(cheminListe);
if (liste) {
  if (typeof liste.titre !== 'string' || !liste.titre.trim()) erreur(cheminListe, '« titre » manquant');
  if (!Array.isArray(liste.matieres)) erreur(cheminListe, '« matieres » doit être une liste');
  const vus = new Map();
  for (const m of Array.isArray(liste.matieres) ? liste.matieres : []) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.slug ?? '')) {
      erreur(cheminListe, `identifiant de matière invalide : « ${m.slug} »`);
      continue;
    }
    if (!m.nom) erreur(cheminListe, `nom manquant pour ${m.slug}`);
    for (const n of new Set([m.slug, m.nom ?? '', ...(m.alias ?? [])].map(normaliser))) {
      if (vus.has(n)) erreur(cheminListe, `« ${n} » désigne à la fois ${vus.get(n)} et ${m.slug}`);
      vus.set(n, m.slug);
    }
    verifierMatiere(m, cheminListe);
  }
}

for (const i of infos) console.log(`ℹ ${i}`);
for (const a of avertissements) console.log(`⚠ ${a}`);
for (const e of erreurs) console.log(`✘ ${e}`);
console.log(
  `\n${erreurs.length ? '✘ À corriger' : '✔ Site valide'} : ${erreurs.length} erreur(s), ${avertissements.length} avertissement(s).`,
);
process.exit(erreurs.length ? 1 : 0);
