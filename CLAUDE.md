# Site de révision — L3 Économie, TSE

Site statique (HTML/CSS/JS, sans backend) que l'étudiant enrichit après chaque cours : il dépose ses notes brutes dans `<matière>/notes/`, Claude en tire les fiches de révision. Matières, identifiants et alias : `matieres.json`.

## Consignes de l'étudiant (prioritaires)

1. **Notes d'abord.** S'appuyer en priorité sur les notes de l'étudiant. Tout élément qui n'y figure pas est marqué clairement « hors notes ».
2. **Ne jamais corriger les notes en silence : signaler.** Tout passage incomplet, ambigu, illisible ou qui semble faux est signalé dans la fiche vigilance, à vérifier avec le poly ou le prof. Les fichiers de `notes/` ne sont jamais modifiés, renommés, déplacés ni supprimés.
3. **Ton et niveau universitaires**, pas de vulgarisation infantilisante.
4. **Maths rendues avec KaTeX. Site lisible sur téléphone.**
5. **Garder une trace des notes déjà traitées** pour ne traiter que les nouvelles (`outils/registre.mjs`).
6. **Un commit après chaque mise à jour**, poussé aussitôt.

Pour chaque matière, le site présente, séance par séance : une fiche de cours synthétisée à partir des notes, une fiche vigilance et un quiz avec correction détaillée. S'y ajoute une section « Questions » où s'accumulent les questions de l'étudiant et les réponses.

### Ce que « hors notes » veut dire

Est hors notes toute notion, définition, formule, hypothèse, démonstration, exemple, question de quiz ou référence absente des notes. Une mise en garde qui porte sur un contenu des notes n'est pas hors notes ; elle le devient si elle fait appel à une notion que les notes n'abordent pas. Marquage : `[hors notes]` en tête de la phrase, de l'élément de liste ou de l'énoncé de quiz ; encadré `> [!HORS-NOTES]` pour un bloc entier.

Si l'étudiant dépose un document officiel (poly, diapositives, feuille de TD) plutôt que des notes personnelles, s'en servir comme source en le citant comme tel (« poly », « diapos ») ; un écart entre ses notes et ce document est un point « À vérifier ».

### Signaler sans corriger

- Refaire chaque calcul et chaque démonstration des notes. Si le résultat diffère, c'est un point « À vérifier ».
- Un point « À vérifier » contient : citation exacte du passage avec fichier et page (ou photo), nature (incomplet, ambigu, probablement faux, illisible), raison, proposition présentée comme telle, avec qui vérifier (poly ou prof).
- Dans la fiche de cours, garder la version des notes et renvoyer au point (`**V2**`). On peut donner la version proposée à côté, étiquetée comme proposition, jamais comme étant celle des notes.
- Même traitement pour une contradiction entre deux séances, un changement de notation ou un passage illisible (ne jamais deviner un mot illisible).
- Quand l'étudiant rapporte la réponse du poly ou du prof : passer le point en `[résolu]` avec une ligne **Résolution** (date, source), mettre la fiche de cours à jour, commiter. Ne jamais supprimer un point.

### Notations et langue

- Garder les notations et la terminologie du cours, même si un manuel fait autrement. Signaler en vigilance les conventions qui varient d'une source à l'autre (signe du multiplicateur de Lagrange, élasticité en valeur absolue ou non, etc.).
- Fiches en français. Pour un cours donné en anglais (Climate Economics, The Poor, The Rich, and The Capitalist…), garder entre parenthèses les termes anglais du cours, utiles à l'examen.

## Arborescence

```
index.html, matieres.json      accueil et liste des matières
assets/                        app.js (interface), rendu.js (Markdown + KaTeX, partagé avec les outils), style.css, vendor/
outils/                        registre.mjs, verifier.mjs, nouvelle-matiere.mjs (Node, sans dépendance)
modeles/                       modèles de référence des fiches : les relire avant d'écrire
.claude/skills/                /nouveau-cours et /question
<matière>/
  index.html                   page de la matière (générée, ne pas modifier à la main)
  matiere.json                 liste des séances
  notes-traitees.json          registre des notes traitées (écrit uniquement par outils/registre.mjs)
  notes/                       notes brutes de l'étudiant : lecture seule
  seances/<id>-cours.md, <id>-vigilance.md, <id>-quiz.md
  questions.md
```

## Séances

- Identifiant : type + numéro sur deux chiffres, `cm03`, `td01`, `tp02` (ou `s04` si le cours ne distingue pas CM et TD). Numéro = rang dans le cours : `cm03` est le troisième cours magistral, même si ses notes arrivent en retard. En cas de doute sur le type ou le numéro, demander.
- Entrée de `matiere.json` : `{ "id": "cm03", "date": "2026-09-24", "titre": "…", "sources": ["notes/…"] }`, avec `"libelle"` facultatif (sinon « CM 3 »). Date du cours (pas du dépôt), `null` si inconnue. Titre en texte simple, sans LaTeX (Unicode : σ, ≤, ℝ).
- Points vigilance numérotés V1, V2… dans chaque séance, jamais renumérotés.

## Contenu des fiches (modèles dans `modeles/`)

- **Cours** : objectif, parties numérotées, définitions, hypothèses, résultats, démonstrations ou idées de preuve, méthodes, exemples des notes, intuition économique, et « ## À retenir » (5 à 8 points).
- **Vigilance** : les cinq rubriques, toujours présentes et dans cet ordre : « ## Pièges et erreurs fréquentes », « ## Hypothèses à ne pas oublier », « ## Confusions entre notions proches », « ## Conditions à vérifier » (signes, CPO/CSO, contraintes saturées, domaine…), « ## À vérifier dans tes notes » (points `### V1 — Titre [ouvert]`). Rubrique sans contenu : « Rien à signaler pour cette séance. »
- **Quiz** : 8 à 12 questions, `## Q1`, `## Q2 · Calcul`… QCM en cases `- [ ]` / `- [x]` (plusieurs `[x]` = plusieurs bonnes réponses) ; sans cases = question ouverte ou calcul. Chaque question a une section `### Correction` détaillée qui explique aussi pourquoi chaque mauvais choix est faux. Les mauvais choix reprennent les pièges de la fiche vigilance. Mêler QCM et calculs, et tester la compréhension plutôt que la mémoire.
- **Questions** : une section `## <question telle que posée>`, ligne `*25 sept. 2026 · CM 3*`, réponse, puis **Sources**. Ajout en fin de fichier.

## Conventions d'écriture

- Maths : `$…$` en ligne, `$$…$$` en bloc (seuls sur leurs lignes). Pas de `\(…\)` ni de `\[…\]`, pas de macros personnalisées (GitHub affiche aussi les fiches). `\$` pour un dollar littéral. Dans un tableau, `\lvert x \rvert` plutôt que `|x|`.
- Encadrés : `> [!TYPE] Titre facultatif`, chaque ligne suivante préfixée par `> `. Types : DEFINITION, PROPOSITION, THEOREME, METHODE, EXEMPLE, INTUITION, REMARQUE, PIEGE, HORS-NOTES, A-VERIFIER.
- Badges : `[hors notes]`, `[à vérifier]`, `[ouvert]`, `[résolu]`.
- Renvoi vers un point de la fiche vigilance de la même séance : `**V2**` (lien sur le site). Vers une autre séance : « CM 2, V1 » en clair.
- Liens relatifs au fichier Markdown : depuis `seances/`, citer une note par `[notes/x.pdf](../notes/x.pdf)` ; depuis `questions.md`, par `[notes/x.pdf](notes/x.pdf)`. Nom avec espaces : `(<../notes/mon fichier.pdf>)`.
- Emphase avec `*…*` et `**…**` (pas `_…_`). Pas de HTML brut.

## Lire les notes

- PDF : outil Read (paramètre `pages` au-delà de 10 pages). Images JPEG, PNG, WebP, fichiers .txt et .md : outil Read.
- Photos HEIC/HEIF (iPhone) : les convertir dans le dossier temporaire de la session, jamais dans `notes/` :
  `python3 -m pip install --quiet pillow pillow-heif` puis
  `python3 -c "import sys; from PIL import Image; from pillow_heif import register_heif_opener; register_heif_opener(); Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'JPEG', quality=90)" <note.heic> <temporaire.jpg>`
- Format illisible : le dire à l'étudiant et ne pas marquer la note comme traitée.

## Outils

- `node outils/registre.mjs [matière]` : notes nouvelles, modifiées, renommées ou supprimées (toutes les matières sans argument).
- `node outils/registre.mjs <matière> --marquer <séance>[,<séance>] <fichier>…` : enregistre des notes comme traitées ; `--oublier <fichier>…` pour les retirer.
- `node outils/verifier.mjs` : à lancer avant chaque commit ; il faut 0 erreur. Il compile chaque formule avec KaTeX et contrôle liens, rubriques, quiz et renvois.
- `node outils/nouvelle-matiere.mjs <id> "<Nom>" --alias a,b` : ajouter une matière ; `--regenerer` réécrit les pages matière après un changement du modèle (`outils/commun.mjs`).
- Aperçu local : `python3 -m http.server` à la racine, puis http://localhost:8000 (ouvrir `index.html` directement ne marche pas).

## Git

- Un commit par mise à jour (une séance traitée, une question, une résolution), message en français : `optimisation: CM 3 — Lagrangien et CSO`, `optimisation: question — rôle de la CSO`, `optimisation: CM 3 — V2 résolu`. Puis `git push -u origin HEAD`.
- Jamais de commit si `outils/verifier.mjs` signale une erreur.
