# Révisions — L3 Économie, TSE

Site de révision statique : pour chaque matière et chaque séance, une fiche de cours, une fiche vigilance et un quiz corrigé, tirés de mes notes par Claude Code, plus une section Questions.

## Mettre à jour après un cours

1. Déposer les notes de la séance dans `<matière>/notes/` : PDF, photos (JPEG ou PNG de préférence), `.txt` ou `.md`. Sur GitHub : ouvrir le dossier, puis *Add file → Upload files*. Un nom qui commence par la date aide, par exemple `2026-09-24-cm3.pdf`.
2. Dans Claude Code : `/nouveau-cours <matière>`, ou `/nouveau-cours` pour toutes les matières.
3. Pour une question : `/question <matière> <ta question>`.

Noms de matière acceptés : l'identifiant, un alias ou le nom (voir `matieres.json`), par exemple `climat`, `optim`, `probas`, `prc`.

## Consulter le site

- **En ligne** : GitHub Pages (*Settings → Pages → Deploy from a branch*, dossier racine). Attention, Pages publie tout le dépôt, notes comprises.
- **En local** : `python3 -m http.server` à la racine du dépôt, puis http://localhost:8000. Ouvrir `index.html` directement ne marche pas, car le navigateur bloque la lecture des fiches.

Les règles suivies par Claude sont dans [CLAUDE.md](CLAUDE.md).
