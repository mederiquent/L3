// Moteur de rendu partagé : le site (navigateur) et outils/verifier.mjs (Node)
// interprètent les fiches avec exactement le même code.
//
// Conventions reconnues (détaillées dans CLAUDE.md) :
//   maths      $…$ (en ligne), $$…$$ (bloc), bloc de code ```math
//   encadrés   > [!DEFINITION] Titre facultatif   (voir ENCADRES)
//   badges     [hors notes] [à vérifier] [ouvert] [résolu]
//   renvois    **V2** dans une fiche = point V2 de la fiche vigilance de la séance

import { Marked } from './vendor/marked/marked.esm.js';

export const ENCADRES = {
  DEFINITION: 'Définition',
  PROPOSITION: 'Proposition',
  THEOREME: 'Théorème',
  METHODE: 'Méthode',
  EXEMPLE: 'Exemple',
  INTUITION: 'Intuition',
  REMARQUE: 'Remarque',
  PIEGE: 'Piège',
  'HORS-NOTES': 'Hors notes',
  'A-VERIFIER': 'À vérifier',
  // alertes GitHub, acceptées telles quelles
  NOTE: 'Note',
  TIP: 'Astuce',
  IMPORTANT: 'Important',
  WARNING: 'Attention',
  CAUTION: 'Attention',
};

export const BADGES = {
  'hors notes': { classe: 'hors-notes', libelle: 'hors notes' },
  'a verifier': { classe: 'a-verifier', libelle: 'à vérifier' },
  ouvert: { classe: 'ouvert', libelle: 'ouvert' },
  resolu: { classe: 'resolu', libelle: 'résolu' },
};

export const RUBRIQUES_VIGILANCE = [
  'Pièges et erreurs fréquentes',
  'Hypothèses à ne pas oublier',
  'Confusions entre notions proches',
  'Conditions à vérifier',
  'À vérifier dans tes notes',
];

export const TYPES_FICHES = ['cours', 'vigilance', 'quiz'];

// ---------------------------------------------------------------- utilitaires

export function sansAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normaliser(s) {
  return sansAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function echapper(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function identifiantTitre(texte) {
  const v = /^V(\d+)\b/.exec(texte.trim());
  if (v) return `v${v[1]}`;
  return (
    normaliser(texte.replace(/\$[^$]*\$/g, ' '))
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section'
  );
}

// « cm03 » → « CM 3 », « td01 » → « TD 1 », « s04 » → « Séance 4 »
export function libelleSeance(seance) {
  if (seance.libelle) return seance.libelle;
  const m = /^([a-z]+)0*(\d+)$/.exec(seance.id);
  if (!m) return seance.id;
  return m[1] === 's' ? `Séance ${m[2]}` : `${m[1].toUpperCase()} ${m[2]}`;
}

export function fichierSeance(seance, type) {
  return `seances/${seance.id}-${type}.md`;
}

// Ordre d'affichage : date du cours, puis identifiant.
export function ordreSeances(a, b) {
  const da = a.date || '9999';
  const db = b.date || '9999';
  if (da !== db) return da < db ? -1 : 1;
  return a.id.localeCompare(b.id, 'fr', { numeric: true });
}

// ---------------------------------------------------------------- maths

// Maths en ligne : $…$ ou $$…$$. Règles (celles de Pandoc) pour ne pas prendre
// un montant pour une formule : pas d'espace juste après le $ ouvrant ni juste
// avant le $ fermant, pas de chiffre juste après le $ fermant. \$ = dollar littéral.
function lireMathsLigne(src) {
  if (src[0] !== '$') return null;
  const double = src[1] === '$';
  const ouverture = double ? 2 : 1;
  for (let i = ouverture; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c !== '$') continue;
    if (double) {
      if (src[i + 1] !== '$') return null;
      const tex = src.slice(2, i);
      if (!tex.trim()) return null;
      return { longueur: i + 2, tex: tex.trim(), display: true };
    }
    const tex = src.slice(1, i);
    if (!tex || /^\s/.test(tex) || /\s$/.test(tex) || /\d/.test(src[i + 1] || '')) return null;
    return { longueur: i + 1, tex, display: false };
  }
  return null;
}

function premierDollar(src) {
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === '$') return i;
  }
  return -1;
}

// Remplace les maths en ligne par des caractères neutres de même longueur, pour
// que les * et _ des formules (x^*, x_1…) ne soient pas pris pour de l'italique.
function masquerMaths(src) {
  let res = '';
  let i = 0;
  while (i < src.length) {
    const j = premierDollar(src.slice(i));
    if (j < 0) break;
    res += src.slice(i, i + j);
    i += j;
    const m = lireMathsLigne(src.slice(i));
    if (m) {
      res += 'a'.repeat(m.longueur);
      i += m.longueur;
    } else {
      res += '$';
      i += 1;
    }
  }
  return res + src.slice(i);
}

// ---------------------------------------------------------------- moteur

/**
 * Crée un moteur de rendu. `katex` est la bibliothèque KaTeX (window.katex dans
 * le navigateur, require(...) dans Node).
 *
 * Options de rendu (par appel) :
 *   base          URL du fichier Markdown : les liens relatifs sont résolus par rapport à lui
 *   lienV(n)      adresse vers laquelle pointe un renvoi **Vn**
 *   surErreurTex(tex, erreur), surAvertTex(tex, message), surLien(href, cible)
 */
export function creerMoteur(katex) {
  let ctx = {};

  function tex(source, display) {
    try {
      return katex.renderToString(source, {
        displayMode: display,
        throwOnError: true,
        output: 'htmlAndMathml',
        strict: (code, message) => {
          ctx.surAvertTex?.(source, message);
          return 'ignore';
        },
      });
    } catch (erreur) {
      ctx.surErreurTex?.(source, erreur);
      return `<code class="erreur-tex" title="${echapper(erreur.message)}">${echapper(source)}</code>`;
    }
  }

  function resoudre(href) {
    if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) || !ctx.base) return href;
    try {
      return new URL(href, ctx.base).href;
    } catch {
      return href;
    }
  }

  const extensions = [
    {
      name: 'mathsBloc',
      level: 'block',
      start(src) {
        const m = /(^|\n) {0,3}\$\$/.exec(src);
        return m ? m.index + m[1].length : undefined;
      },
      tokenizer(src) {
        const m = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src);
        if (m) return { type: 'mathsBloc', raw: m[0], tex: m[1].trim() };
      },
      renderer(token) {
        return `<div class="maths-bloc">${tex(token.tex, true)}</div>\n`;
      },
    },
    {
      name: 'mathsLigne',
      level: 'inline',
      start(src) {
        const i = premierDollar(src);
        return i < 0 ? undefined : i;
      },
      tokenizer(src) {
        const m = lireMathsLigne(src);
        if (m) return { type: 'mathsLigne', raw: src.slice(0, m.longueur), tex: m.tex, display: m.display };
      },
      renderer(token) {
        return tex(token.tex, token.display);
      },
    },
    {
      name: 'encadre',
      level: 'block',
      start(src) {
        const m = /(^|\n) {0,3}> ?\[!/.exec(src);
        return m ? m.index + m[1].length : undefined;
      },
      tokenizer(src) {
        const m = /^ {0,3}> ?\[!([A-Za-zÀ-ÿ-]+)\][ \t]*([^\n]*)(?:\n|$)((?: {0,3}>[^\n]*(?:\n|$))*)/.exec(src);
        if (!m) return;
        const type = sansAccents(m[1]).toUpperCase();
        const token = {
          type: 'encadre',
          raw: m[0],
          genre: type,
          titre: m[2].trim(),
          titreTokens: [],
          tokens: [],
        };
        this.lexer.blockTokens(m[3].replace(/^ {0,3}> ?/gm, ''), token.tokens);
        this.lexer.inline(token.titre, token.titreTokens);
        return token;
      },
      renderer(token) {
        const libelle = ENCADRES[token.genre] ?? token.genre;
        const classe = token.genre.toLowerCase();
        const titre = token.titre ? ` <span class="encadre-nom">${this.parser.parseInline(token.titreTokens)}</span>` : '';
        return (
          `<aside class="encadre encadre-${classe}"><p class="encadre-titre"><span class="encadre-type">${libelle}</span>${titre}</p>` +
          `${this.parser.parse(token.tokens)}</aside>\n`
        );
      },
      childTokens: ['titreTokens', 'tokens'],
    },
    {
      name: 'badge',
      level: 'inline',
      start(src) {
        const i = src.indexOf('[');
        return i < 0 ? undefined : i;
      },
      tokenizer(src) {
        const m = /^\[(hors notes|à vérifier|a verifier|ouvert|résolu|resolu)\]/i.exec(src);
        if (m) return { type: 'badge', raw: m[0], cle: normaliser(m[1]) };
      },
      renderer(token) {
        const b = BADGES[token.cle];
        return `<span class="badge badge-${b.classe}">${b.libelle}</span>`;
      },
    },
  ];

  const renderer = {
    heading({ tokens, depth, text }) {
      let id = identifiantTitre(text);
      for (let k = 2; ctx.ids?.has(id); k++) id = `${identifiantTitre(text)}-${k}`;
      ctx.ids?.add(id);
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    strong({ tokens, text }) {
      const html = this.parser.parseInline(tokens);
      const v = /^V(\d+)$/.exec(text);
      if (v && ctx.lienV) return `<a class="renvoi-v" href="${echapper(ctx.lienV(v[1]))}"><strong>${html}</strong></a>`;
      return `<strong>${html}</strong>`;
    },
    link({ href, title, tokens }) {
      const cible = resoudre(href);
      ctx.surLien?.(href, cible);
      // Tout lien hors du site (notes brutes, pages externes) s'ouvre dans un nouvel onglet.
      const nouvelOnglet = !href.startsWith('#');
      return (
        `<a href="${echapper(cible)}"${title ? ` title="${echapper(title)}"` : ''}` +
        `${nouvelOnglet ? ' target="_blank" rel="noopener"' : ''}>${this.parser.parseInline(tokens)}</a>`
      );
    },
    image({ href, title, text }) {
      const cible = resoudre(href);
      ctx.surLien?.(href, cible);
      return `<img src="${echapper(cible)}" alt="${echapper(text)}"${title ? ` title="${echapper(title)}"` : ''} loading="lazy">`;
    },
    code({ text, lang }) {
      if ((lang || '').trim() === 'math') return `<div class="maths-bloc">${tex(text.trim(), true)}</div>\n`;
      return false;
    },
  };

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    extensions,
    renderer,
    hooks: {
      emStrongMask(src) {
        return masquerMaths(src);
      },
    },
  });

  function avec(options, rendu) {
    ctx = { ...options, ids: new Set() };
    try {
      return rendu();
    } finally {
      ctx = {};
    }
  }

  return {
    /** Markdown (blocs) → HTML */
    rendre: (md, options = {}) => avec(options, () => marked.parse(md ?? '')),
    /** Markdown d'une seule ligne (titre, choix de QCM) → HTML sans <p> */
    rendreLigne: (md, options = {}) => avec(options, () => marked.parseInline(md ?? '')),
    lexer: (md) => marked.lexer(md ?? ''),
    parcourir: (tokens, rappel) => marked.walkTokens(tokens, rappel),
  };
}

// ---------------------------------------------------------------- structure des fiches

// Annote chaque ligne : est-elle dans un bloc de code (``` ou ~~~) ?
function annoterLignes(texte) {
  let cloture = null;
  return texte
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((ligne, i) => {
      const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(ligne);
      let code = cloture !== null;
      if (cloture !== null) {
        if (f && f[1][0] === cloture[0] && f[1].length >= cloture.length && f[2].trim() === '') cloture = null;
      } else if (f) {
        cloture = f[1];
        code = true;
      }
      return { texte: ligne, num: i + 1, code };
    });
}

/**
 * Découpe un document en sections au niveau de titre donné (2 pour « ## »).
 * `ligne` = numéro (1 = première ligne) de la ligne de titre dans `md`.
 */
export function decouper(md, niveau) {
  const prefixe = '#'.repeat(niveau) + ' ';
  const avant = [];
  const sections = [];
  let courante = null;
  for (const l of annoterLignes(md ?? '')) {
    if (!l.code && l.texte.startsWith(prefixe)) {
      courante = { titre: l.texte.slice(prefixe.length).replace(/\s+#+\s*$/, '').trim(), lignes: [], ligne: l.num };
      sections.push(courante);
    } else {
      (courante ? courante.lignes : avant).push(l.texte);
    }
  }
  return {
    avant: avant.join('\n'),
    sections: sections.map((s) => ({ titre: s.titre, corps: s.lignes.join('\n'), ligne: s.ligne })),
  };
}

export function titrePrincipal(md) {
  const { avant } = decouper(md, 2);
  const m = /^# +(.+?)\s*$/m.exec(avant);
  return m ? m[1] : '';
}

/**
 * Quiz : une section « ## » par question ; choix en liste de cases
 * « - [ ] » / « - [x] » ; correction après « ### Correction ».
 * Sans cases : question ouverte (exercice, calcul) avec correction à révéler.
 */
export function analyserQuiz(md) {
  const { sections } = decouper(md, 2);
  const questions = sections.map((section, i) => {
    const enonce = [];
    const choix = [];
    const correction = [];
    const problemes = [];
    let zone = 'enonce';
    for (const l of annoterLignes(section.corps)) {
      const ligneAbs = section.ligne + l.num;
      if (zone !== 'correction' && !l.code && /^### +correction\b/i.test(l.texte)) {
        zone = 'correction';
        continue;
      }
      if (zone === 'correction') {
        correction.push(l.texte);
        continue;
      }
      const c = !l.code && /^[-*+] \[([ xX])\] +(.*)$/.exec(l.texte);
      if (c) {
        choix.push({ lignes: [c[2]], correct: c[1] !== ' ' });
        zone = 'choix';
      } else if (zone === 'choix') {
        if (l.texte.trim() === '' || l.code || /^( {2,}|\t)/.test(l.texte)) {
          choix[choix.length - 1].lignes.push(l.texte.replace(/^( {2,6}|\t)/, ''));
        } else {
          problemes.push(`ligne ${ligneAbs} : texte entre les choix et « ### Correction »`);
        }
      } else {
        enonce.push(l.texte);
      }
    }
    const q = {
      numero: i + 1,
      titre: section.titre,
      sousTitre: section.titre.replace(/^Q\d+\s*[·:.—–-]?\s*/i, ''),
      enonce: enonce.join('\n').trim(),
      choix: choix.map((c) => ({ texte: c.lignes.join('\n').trim(), correct: c.correct })),
      correction: correction.join('\n').trim(),
      ligne: section.ligne,
      problemes,
    };
    q.nbCorrects = q.choix.filter((c) => c.correct).length;
    q.type = q.choix.length ? 'qcm' : 'ouverte';
    if (!q.enonce) problemes.push('énoncé vide');
    if (!q.correction) problemes.push('pas de correction (section « ### Correction » absente ou vide)');
    if (q.choix.length === 1) problemes.push('un seul choix : il en faut au moins deux');
    if (q.choix.length >= 2 && q.nbCorrects === 0) problemes.push('aucune bonne réponse cochée « - [x] »');
    return q;
  });
  return { titre: titrePrincipal(md), questions };
}

/**
 * Questions : une section « ## » par question, dans l'ordre où elles ont été posées.
 * Première ligne en italique = méta (date · séance).
 */
export function analyserQuestions(md) {
  const { sections } = decouper(md, 2);
  return sections.map((s) => {
    const lignes = s.corps.split('\n');
    let k = 0;
    while (k < lignes.length && lignes[k].trim() === '') k++;
    let meta = '';
    const m = k < lignes.length ? /^\s*([*_])(?![*_])(.+?)\1\s*$/.exec(lignes[k]) : null;
    if (m) {
      meta = m[2].trim();
      lignes.splice(0, k + 1);
    }
    return { titre: s.titre, meta, corps: lignes.join('\n').trim(), ligne: s.ligne };
  });
}

/**
 * Fiche vigilance : rubriques « ## » obligatoires ; dans « À vérifier dans tes
 * notes », un point par titre « ### V<n> — Titre [ouvert|résolu] ».
 */
export function analyserVigilance(md) {
  const { sections } = decouper(md, 2);
  const titres = sections.map((s) => normaliser(s.titre));
  const manquantes = RUBRIQUES_VIGILANCE.filter((r) => !titres.includes(normaliser(r)));
  const points = [];
  const problemes = [];
  const section = sections.find((s) => normaliser(s.titre) === normaliser('À vérifier dans tes notes'));
  if (section) {
    for (const p of decouper(section.corps, 3).sections) {
      const ligne = section.ligne + p.ligne;
      const m = /^V(\d+)\s*[—–-]\s*(.+?)\s*\[(ouvert|résolu|resolu)\]$/i.exec(p.titre);
      if (!m) {
        problemes.push(`ligne ${ligne} : titre de point mal formé « ${p.titre} » (attendu : « V1 — Titre [ouvert] »)`);
        continue;
      }
      points.push({ numero: Number(m[1]), titre: m[2], statut: normaliser(m[3]) === 'ouvert' ? 'ouvert' : 'resolu', ligne });
    }
  }
  return { manquantes, points, problemes };
}

/** Numéros des renvois **Vn** présents dans un texte. */
export function renvoisV(md) {
  const res = [];
  for (const l of annoterLignes(md ?? '')) {
    if (l.code) continue;
    for (const m of l.texte.matchAll(/\*\*V(\d+)\*\*/g)) res.push({ numero: Number(m[1]), ligne: l.num });
  }
  return res;
}
