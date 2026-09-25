// Interface du site de révision : accueil, page matière, séances (cours,
// vigilance, quiz) et questions. Le contenu vient des fichiers Markdown/JSON
// du dépôt ; le rendu est assuré par rendu.js (partagé avec outils/verifier.mjs).

import {
  creerMoteur,
  analyserQuiz,
  analyserQuestions,
  analyserVigilance,
  libelleSeance,
  fichierSeance,
  ordreSeances,
  normaliser,
  echapper,
  TYPES_FICHES,
} from './rendu.js';

const RACINE = new URL('../', import.meta.url);
const contenu = document.getElementById('contenu');

// ---------------------------------------------------------------- utilitaires

const cache = new Map();

function charger(chemin, json = false) {
  const url = new URL(chemin, RACINE).href;
  if (!cache.has(url)) {
    const promesse = fetch(url, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} — ${chemin}`);
      return json ? r.json() : r.text();
    });
    promesse.catch(() => cache.delete(url));
    cache.set(url, promesse);
  }
  return cache.get(url);
}

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

function formaterDate(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-').map(Number);
  return FORMAT_DATE.format(new Date(a, m - 1, j));
}

function pluriel(n, mot, motPluriel = `${mot}s`) {
  return `${n} ${n > 1 ? motPluriel : mot}`;
}

const stockage = {
  lire(cle) {
    try {
      return JSON.parse(localStorage.getItem(cle));
    } catch {
      return null;
    }
  },
  ecrire(cle, valeur) {
    try {
      localStorage.setItem(cle, JSON.stringify(valeur));
    } catch {
      /* stockage indisponible (navigation privée…) : tant pis */
    }
  },
};

function afficherErreur(erreur) {
  console.error(erreur);
  contenu.innerHTML = `
    <div class="erreur">
      <p><strong>Impossible de charger cette page.</strong></p>
      <p><code>${echapper(erreur.message)}</code></p>
      <p><a href="${RACINE.href}">Retour à l'accueil</a></p>
    </div>`;
}

function nomFichier(chemin) {
  return chemin.split('/').pop();
}

// ---------------------------------------------------------------- accueil

async function accueil() {
  const liste = await charger('matieres.json', true);
  document.title = liste.titre;
  const cartes = await Promise.all(
    liste.matieres.map(async (m) => {
      const [matiere, questions] = await Promise.all([
        charger(`${m.slug}/matiere.json`, true).catch(() => ({ seances: [] })),
        charger(`${m.slug}/questions.md`).catch(() => ''),
      ]);
      const seances = [...(matiere.seances ?? [])].sort(ordreSeances);
      const derniere = seances[seances.length - 1];
      const nbQuestions = analyserQuestions(questions).length;
      return `
        <li>
          <a class="carte" href="${m.slug}/">
            <span class="carte-titre">${echapper(m.nom)}</span>
            <span class="carte-meta">${pluriel(seances.length, 'séance')} · ${pluriel(nbQuestions, 'question')}</span>
            <span class="carte-meta">${
              derniere
                ? `Dernière : ${echapper(libelleSeance(derniere))}${derniere.date ? ` · ${formaterDate(derniere.date)}` : ''}`
                : 'Pas encore de séance'
            }</span>
          </a>
        </li>`;
    }),
  );
  contenu.innerHTML = `
    <header class="entete">
      <h1>${echapper(liste.titre)}</h1>
      ${liste.sousTitre ? `<p class="sous-titre">${echapper(liste.sousTitre)}</p>` : ''}
    </header>
    <ul class="cartes">${cartes.join('')}</ul>
    <section class="reperes">
      <h2>Repères</h2>
      <ul>
        <li><span class="badge badge-hors-notes">hors notes</span> ajout absent de tes notes (complément, exemple, rappel).</li>
        <li><span class="badge badge-a-verifier">à vérifier</span> passage de tes notes incomplet, ambigu ou douteux : à confirmer avec le poly ou le prof.</li>
        <li><span class="badge badge-ouvert">ouvert</span> <span class="badge badge-resolu">résolu</span> statut d'un point à vérifier.</li>
      </ul>
      <p class="aide">Mise à jour : dépose tes notes dans <code>&lt;matière&gt;/notes/</code>, puis lance
      <code>/nouveau-cours &lt;matière&gt;</code> dans Claude Code. Pour une question :
      <code>/question &lt;matière&gt; &lt;ta question&gt;</code>.</p>
    </section>`;
}

// ---------------------------------------------------------------- page matière

async function pageMatiere() {
  const slug = document.body.dataset.matiere;
  const [liste, matiere] = await Promise.all([charger('matieres.json', true), charger(`${slug}/matiere.json`, true)]);
  const info = liste.matieres.find((m) => m.slug === slug) ?? { slug, nom: slug };
  document.title = `${info.nom} — Révisions`;
  const etat = {
    slug,
    info,
    seances: [...(matiere.seances ?? [])].sort(ordreSeances),
    moteur: creerMoteur(window.katex),
    vue: null,
  };
  const router = () => route(etat).catch(afficherErreur);
  window.addEventListener('hashchange', router);
  await router();
}

function lireAdresse() {
  const [a = '', b = '', c = ''] = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent);
  return { a, b, c };
}

async function route(e) {
  const { a, b, c } = lireAdresse();
  if (!a) return vueSommaire(e);
  if (a === 'questions') return vueQuestions(e);
  const seance = e.seances.find((s) => s.id === a);
  if (!seance) {
    e.vue = null;
    contenu.innerHTML = `${filAriane(e)}<div class="erreur"><p>Séance « ${echapper(a)} » introuvable.</p></div>`;
    return;
  }
  return vueSeance(e, seance, TYPES_FICHES.includes(b) ? b : 'cours', c);
}

function filAriane(e, versMatiere = false) {
  return `<nav class="fil">${
    versMatiere ? `<a href="#">← ${echapper(e.info.nom)}</a>` : `<a href="${RACINE.href}">← Toutes les matières</a>`
  }</nav>`;
}

function defiler(ancre) {
  // Les trois fiches d'une séance sont dans la page : on cherche dans l'onglet visible.
  const cible = ancre && contenu.querySelector(`.panneau:not([hidden]) [id="${CSS.escape(ancre)}"]`);
  if (cible) {
    cible.scrollIntoView({ block: 'start' });
    cible.classList.add('surligne');
    setTimeout(() => cible.classList.remove('surligne'), 1600);
  } else {
    window.scrollTo(0, 0);
  }
}

// ---- sommaire de la matière

async function vueSommaire(e) {
  e.vue = { type: 'sommaire' };
  const questions = analyserQuestions(await charger(`${e.slug}/questions.md`).catch(() => ''));
  const seances = e.seances
    .map((s) => {
      const score = stockage.lire(cleQuiz(e, s));
      return `
        <li>
          <a class="seance" href="#${s.id}">
            <span class="seance-libelle">${echapper(libelleSeance(s))}${s.date ? ` · ${formaterDate(s.date)}` : ''}</span>
            <span class="seance-titre">${echapper(s.titre)}</span>
            <span class="puces" data-seance="${s.id}">${
              score ? `<span class="puce">Quiz : ${score.meilleur}/${score.total}</span>` : ''
            }</span>
          </a>
        </li>`;
    })
    .join('');
  contenu.innerHTML = `
    ${filAriane(e)}
    <header class="entete">
      <h1>${echapper(e.info.nom)}</h1>
      <p class="sous-titre">${pluriel(e.seances.length, 'séance')} · ${pluriel(questions.length, 'question')}</p>
    </header>
    ${
      e.seances.length
        ? `<ol class="seances">${seances}</ol>`
        : `<div class="vide">
            <p>Aucune séance pour l'instant.</p>
            <p>Dépose tes notes dans <code>${echapper(e.slug)}/notes/</code>, puis lance <code>/nouveau-cours ${echapper(e.slug)}</code>.</p>
          </div>`
    }
    <a class="carte carte-questions" href="#questions">
      <span class="carte-titre">Questions</span>
      <span class="carte-meta">${questions.length ? pluriel(questions.length, 'question') : 'Aucune question pour l’instant'}</span>
    </a>
    <p class="aide">Commandes : <code>/nouveau-cours ${echapper(e.slug)}</code> · <code>/question ${echapper(e.slug)} …</code></p>`;
  window.scrollTo(0, 0);

  // Points « à vérifier » encore ouverts, séance par séance (chargés après coup).
  for (const s of e.seances) {
    charger(`${e.slug}/${fichierSeance(s, 'vigilance')}`)
      .then((md) => {
        const ouverts = analyserVigilance(md).points.filter((p) => p.statut === 'ouvert').length;
        const puces = contenu.querySelector(`.puces[data-seance="${s.id}"]`);
        if (ouverts && puces) {
          puces.insertAdjacentHTML('afterbegin', `<span class="puce puce-alerte">${pluriel(ouverts, 'point')} à vérifier</span>`);
        }
      })
      .catch(() => {});
  }
}

// ---- séance : trois onglets

const NOMS_ONGLETS = { cours: 'Cours', vigilance: 'Vigilance', quiz: 'Quiz' };

async function vueSeance(e, s, onglet, ancre) {
  if (e.vue?.type === 'seance' && e.vue.id === s.id) {
    if (e.vue.onglet !== onglet) {
      e.vue.onglet = onglet;
      activerOnglet(onglet);
      window.scrollTo(0, 0);
    }
    if (ancre) defiler(ancre);
    return;
  }
  e.vue = { type: 'seance', id: s.id, onglet };

  const textes = await Promise.all(TYPES_FICHES.map((t) => charger(`${e.slug}/${fichierSeance(s, t)}`).catch(() => null)));
  const [cours, vigilance, quiz] = textes;
  const base = (t) => new URL(`${e.slug}/${fichierSeance(s, t)}`, RACINE).href;
  const lienV = (n) => `#${s.id}/vigilance/v${n}`;
  const ouverts = vigilance ? analyserVigilance(vigilance).points.filter((p) => p.statut === 'ouvert').length : 0;
  const indice = e.seances.indexOf(s);
  const precedente = e.seances[indice - 1];
  const suivante = e.seances[indice + 1];
  const dossier = new URL(`${e.slug}/`, RACINE);
  const sources = (s.sources ?? [])
    .map((f) => `<a href="${echapper(new URL(f, dossier).href)}" target="_blank" rel="noopener">${echapper(nomFichier(f))}</a>`)
    .join(', ');
  const absent = (t) => `<p class="vide">Fiche ${t} absente.</p>`;

  contenu.innerHTML = `
    ${filAriane(e, true)}
    <header class="entete entete-seance">
      <p class="seance-libelle">${echapper(libelleSeance(s))}${s.date ? ` · ${formaterDate(s.date)}` : ''}</p>
      <h1>${echapper(s.titre)}</h1>
      ${sources ? `<p class="sources">Notes : ${sources}</p>` : ''}
    </header>
    <nav class="onglets" role="tablist">
      ${TYPES_FICHES.map(
        (t) => `<a href="#${s.id}/${t}" role="tab" data-onglet="${t}">${NOMS_ONGLETS[t]}${
          t === 'vigilance' && ouverts ? ` <span class="pastille" title="points à vérifier ouverts">${ouverts}</span>` : ''
        }</a>`,
      ).join('')}
    </nav>
    <section class="panneau fiche" data-panneau="cours" role="tabpanel">
      ${cours === null ? absent('de cours') : preparerFiche(e.moteur.rendre(cours, { base: base('cours'), lienV }), s, true)}
    </section>
    <section class="panneau fiche" data-panneau="vigilance" role="tabpanel">
      ${vigilance === null ? absent('vigilance') : preparerFiche(e.moteur.rendre(vigilance, { base: base('vigilance'), lienV }), s, false)}
    </section>
    <section class="panneau" data-panneau="quiz" role="tabpanel"></section>
    <nav class="voisins">
      ${precedente ? `<a href="#${precedente.id}/${onglet}">← ${echapper(libelleSeance(precedente))}</a>` : '<span></span>'}
      ${suivante ? `<a href="#${suivante.id}/${onglet}">${echapper(libelleSeance(suivante))} →</a>` : '<span></span>'}
    </nav>`;

  const panneauQuiz = contenu.querySelector('[data-panneau="quiz"]');
  if (quiz === null) panneauQuiz.innerHTML = absent('de quiz');
  else rendreQuiz(panneauQuiz, analyserQuiz(quiz), e, s, base('quiz'), lienV);

  // Les onglets remplacent l'entrée d'historique : « retour » ramène au sommaire.
  contenu.querySelectorAll('.onglets a').forEach((a) =>
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      location.replace(a.getAttribute('href'));
    }),
  );
  activerOnglet(onglet);
  if (ancre) defiler(ancre);
  else window.scrollTo(0, 0);
}

function activerOnglet(onglet) {
  contenu.querySelectorAll('.onglets a').forEach((a) => {
    const actif = a.dataset.onglet === onglet;
    a.classList.toggle('actif', actif);
    a.setAttribute('aria-selected', String(actif));
  });
  contenu.querySelectorAll('.panneau').forEach((p) => {
    p.hidden = p.dataset.panneau !== onglet;
  });
  contenu.querySelectorAll('.voisins a').forEach((a) => {
    a.setAttribute('href', a.getAttribute('href').replace(/\/[a-z]+$/, `/${onglet}`));
  });
}

// Le titre « # CM 3 — … » des fiches (utile sur GitHub) double l'en-tête de la
// séance : on le retire. La fiche de cours reçoit un sommaire repliable
// à partir de trois parties.
function preparerFiche(html, s, avecSommaire) {
  const gabarit = document.createElement('template');
  gabarit.innerHTML = html;
  const premier = gabarit.content.firstElementChild;
  if (premier?.tagName === 'H1') premier.remove();
  const parties = [...gabarit.content.querySelectorAll('h2')];
  if (avecSommaire && parties.length >= 3) {
    const liens = parties.map((h) => `<li><a href="#${s.id}/cours/${h.id}">${h.innerHTML}</a></li>`).join('');
    gabarit.content.prepend(
      document.createRange().createContextualFragment(
        `<details class="sommaire"><summary>Sommaire</summary><ol>${liens}</ol></details>`,
      ),
    );
  }
  return gabarit.innerHTML;
}

// ---- quiz

function cleQuiz(e, s) {
  return `revisions-l3:${e.slug}:${s.id}:quiz`;
}

function rendreQuiz(panneau, quiz, e, s, base, lienV) {
  const qcm = quiz.questions.filter((q) => q.choix.length >= 2);
  const ouvertes = quiz.questions.length - qcm.length;
  const cle = cleQuiz(e, s);
  const m = e.moteur;
  const opts = { base, lienV };
  // Choix rendus sans lien **Vn** : un lien dans un bouton déclencherait aussi la réponse.
  const lettres = 'ABCDEFGHIJ';
  let repondues = 0;
  let justes = 0;

  const questionHTML = (q, i) => {
    const consigne =
      q.type === 'ouverte' ? 'Question ouverte' : q.nbCorrects > 1 ? 'Plusieurs réponses possibles' : 'Une seule réponse';
    const choix = q.choix
      .map(
        (c, j) => `
          <button type="button" class="choix-btn" data-j="${j}" aria-pressed="false">
            <span class="lettre">${lettres[j] ?? j + 1}</span>
            <span class="choix-texte">${m.rendreLigne(c.texte, { base })}</span>
          </button>`,
      )
      .join('');
    return `
      <li class="question" data-i="${i}">
        <p class="question-etiquette">Question ${i + 1} · ${consigne}</p>
        ${q.sousTitre ? `<p class="question-titre">${m.rendreLigne(q.sousTitre, opts)}</p>` : ''}
        <div class="fiche question-enonce">${m.rendre(q.enonce, opts)}</div>
        ${
          q.type === 'qcm'
            ? `<div class="choix" role="group" aria-label="Réponses">${choix}</div>
               ${q.nbCorrects > 1 ? '<button type="button" class="btn valider">Valider</button>' : ''}`
            : '<button type="button" class="btn voir">Voir la correction</button>'
        }
        <p class="verdict" hidden></p>
        <div class="fiche correction" hidden>
          <p class="correction-titre">Correction</p>
          ${m.rendre(q.correction, opts)}
        </div>
      </li>`;
  };

  const meilleur = stockage.lire(cle);
  panneau.innerHTML = quiz.questions.length
    ? `
      <p class="quiz-intro">${pluriel(quiz.questions.length, 'question')} :
        ${pluriel(qcm.length, 'QCM', 'QCM')}${ouvertes ? `, ${pluriel(ouvertes, 'question ouverte', 'questions ouvertes')}` : ''}.
        ${meilleur ? `<span class="meilleur">Meilleur score : ${meilleur.meilleur}/${meilleur.total}</span>` : ''}
      </p>
      <ol class="quiz">${quiz.questions.map(questionHTML).join('')}</ol>
      <div class="bilan" aria-live="polite"></div>`
    : '<p class="vide">Quiz vide.</p>';

  const bilan = panneau.querySelector('.bilan');
  const majBilan = () => {
    if (!bilan || !qcm.length) return;
    const fini = repondues === qcm.length;
    bilan.innerHTML = `
      <p><strong>Score : ${justes} / ${qcm.length}</strong>${fini ? '' : ` · ${repondues} QCM sur ${qcm.length} répondus`}</p>
      ${fini ? '<button type="button" class="btn recommencer">Recommencer</button>' : ''}`;
    if (fini) {
      const ancien = stockage.lire(cle);
      if (!ancien || justes >= ancien.meilleur) {
        stockage.ecrire(cle, { meilleur: justes, total: qcm.length, date: new Date().toISOString().slice(0, 10) });
      }
      bilan.querySelector('.recommencer').addEventListener('click', () => {
        rendreQuiz(panneau, quiz, e, s, base, lienV);
        panneau.scrollIntoView({ block: 'start' });
      });
    }
  };
  majBilan();

  const corriger = (li, q, choisis) => {
    const bonnes = new Set(q.choix.flatMap((c, j) => (c.correct ? [j] : [])));
    const juste = bonnes.size === choisis.size && [...bonnes].every((j) => choisis.has(j));
    li.querySelectorAll('.choix-btn').forEach((btn) => {
      const j = Number(btn.dataset.j);
      btn.disabled = true;
      if (bonnes.has(j) && choisis.has(j)) btn.classList.add('juste');
      else if (choisis.has(j)) btn.classList.add('faux');
      else if (bonnes.has(j)) btn.classList.add('manquee');
    });
    li.querySelector('.valider')?.remove();
    const attendues = [...bonnes].map((j) => lettres[j]).join(', ');
    const verdict = li.querySelector('.verdict');
    verdict.hidden = false;
    verdict.className = `verdict ${juste ? 'verdict-juste' : 'verdict-faux'}`;
    verdict.textContent = juste ? 'Bonne réponse.' : `Réponse attendue : ${attendues}.`;
    li.querySelector('.correction').hidden = false;
    repondues += 1;
    if (juste) justes += 1;
    majBilan();
  };

  panneau.querySelectorAll('.question').forEach((li) => {
    const q = quiz.questions[Number(li.dataset.i)];
    if (q.type === 'ouverte') {
      li.querySelector('.voir').addEventListener('click', (ev) => {
        ev.currentTarget.remove();
        li.querySelector('.correction').hidden = false;
      });
      return;
    }
    const boutons = [...li.querySelectorAll('.choix-btn')];
    boutons.forEach((btn) =>
      btn.addEventListener('click', () => {
        if (q.nbCorrects > 1) {
          btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
        } else {
          corriger(li, q, new Set([Number(btn.dataset.j)]));
        }
      }),
    );
    li.querySelector('.valider')?.addEventListener('click', () => {
      const choisis = new Set(boutons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => Number(b.dataset.j)));
      if (choisis.size) corriger(li, q, choisis);
    });
  });
}

// ---- questions

async function vueQuestions(e) {
  e.vue = { type: 'questions' };
  const md = await charger(`${e.slug}/questions.md`);
  const base = new URL(`${e.slug}/questions.md`, RACINE).href;
  const entrees = analyserQuestions(md).reverse();
  contenu.innerHTML = `
    ${filAriane(e, true)}
    <header class="entete">
      <h1>Questions</h1>
      <p class="sous-titre">${
        entrees.length
          ? `${pluriel(entrees.length, 'question')}, les plus récentes en premier. Touche une question pour voir la réponse.`
          : 'Aucune question pour l’instant.'
      }</p>
    </header>
    ${entrees.length > 3 ? '<input type="search" class="recherche" placeholder="Rechercher dans les questions…" aria-label="Rechercher">' : ''}
    <div class="questions">
      ${entrees
        .map(
          (q) => `
          <details class="entree">
            <summary>
              <span class="entree-titre">${e.moteur.rendreLigne(q.titre, { base })}</span>
              ${q.meta ? `<span class="entree-meta">${e.moteur.rendreLigne(q.meta, { base })}</span>` : ''}
            </summary>
            <div class="fiche">${e.moteur.rendre(q.corps, { base })}</div>
          </details>`,
        )
        .join('')}
    </div>
    ${entrees.length ? '' : `<p class="aide">Pose une question avec <code>/question ${echapper(e.slug)} …</code> dans Claude Code.</p>`}`;
  window.scrollTo(0, 0);

  const recherche = contenu.querySelector('.recherche');
  recherche?.addEventListener('input', () => {
    const terme = normaliser(recherche.value);
    contenu.querySelectorAll('.entree').forEach((d) => {
      d.hidden = Boolean(terme) && !normaliser(d.textContent).includes(terme);
    });
  });
}

// ---------------------------------------------------------------- démarrage

if (location.protocol !== 'file:') {
  const page = document.body.dataset.page;
  const demarrer = page === 'matiere' ? pageMatiere : accueil;
  if (page === 'matiere' && !window.katex) afficherErreur(new Error('KaTeX ne s’est pas chargé.'));
  else demarrer().catch(afficherErreur);
}
