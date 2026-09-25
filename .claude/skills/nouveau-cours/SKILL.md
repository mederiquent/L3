---
name: nouveau-cours
description: Traite les nouvelles notes déposées dans <matière>/notes/ et met à jour la fiche de cours, la fiche vigilance et le quiz des séances concernées, puis commite et pousse. À utiliser quand l'étudiant a déposé des notes de cours (PDF, photos, .txt, .md) ou demande de mettre à jour les fiches d'une matière.
argument-hint: "[matière]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node outils/registre.mjs:*), Bash(node outils/verifier.mjs:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*)
---

# /nouveau-cours

Matière demandée : « $ARGUMENTS » (vide = toutes les matières).

Les consignes de `CLAUDE.md` s'appliquent à chaque étape. Relire `modeles/cours.md`, `modeles/vigilance.md` et `modeles/quiz.md` avant d'écrire.

## 1. Repérer les notes à traiter

- `node outils/registre.mjs <matière>` : il reconnaît identifiant, alias ou nom, et liste les notes NOUVELLE, MODIFIÉE, RENOMMÉE, SUPPRIMÉE. Sans argument, `node outils/registre.mjs` résume toutes les matières : traiter ensuite chaque matière qui a des notes en attente.
- Matière inconnue ou ambiguë : montrer la liste affichée et demander ; ne pas deviner.
- Rien à traiter : le dire en une ligne et s'arrêter (pas de commit).
- RENOMMÉE : seul le nom a changé. Mettre à jour `sources` dans `matiere.json`, puis `--marquer` le nouveau nom (mêmes séances) et `--oublier` l'ancien. Aucun contenu à réécrire.
- SUPPRIMÉE : ne rien effacer des fiches. Le signaler à l'étudiant et lui demander s'il faut retirer la séance ou simplement la note du registre.

## 2. Lire chaque note

- Lire intégralement chaque note nouvelle ou modifiée (voir « Lire les notes » dans `CLAUDE.md` pour PDF, photos, HEIC).
- Note MODIFIÉE : relire la nouvelle version, repérer ce qui a changé par rapport à la fiche existante, et ne mettre à jour que ce qui en découle.
- Pour chaque note, repérer la date du cours, le type (CM, TD, TP), le numéro de séance, et les passages illisibles ou douteux.

## 3. Rattacher chaque note à une séance

- Indices : date ou numéro dans le nom du fichier ou sur la note, continuité avec la séance précédente (`matiere.json`, fiches existantes).
- Deux cas :
  - nouvelle séance : identifiant `cm03`, `td01`… selon `CLAUDE.md` ;
  - complément d'une séance existante (suite des photos, notes d'un camarade, version propre) : mettre à jour cette séance.
- En cas de doute réel (type, numéro, séance), poser la question à l'étudiant avant d'écrire.
- Plusieurs séances en attente : les traiter dans l'ordre chronologique, une par une (étapes 4 à 7 pour chacune).

## 4. Écrire ou mettre à jour les trois fiches

- `seances/<id>-cours.md`, `seances/<id>-vigilance.md`, `seances/<id>-quiz.md`, au format des modèles.
- Entrée dans `matiere.json` : id, date, titre, sources (tous les fichiers de notes de la séance).
- Refaire chaque calcul et chaque démonstration. Tout écart, trou, ambiguïté ou passage illisible devient un point « À vérifier » (nouveau numéro V), et la fiche de cours y renvoie par `**Vn**`.
- Cohérence avec les séances précédentes : contradiction, changement de notation ou d'hypothèse → point « À vérifier » dans la nouvelle séance, citant les deux passages. Ne pas arbitrer seul.
- Séance existante complétée : conserver les numéros V existants, ajouter les nouveaux à la suite. Ajouter des questions au quiz sans casser celles qui existent, sauf si elles deviennent fausses.
- Quiz : 8 à 12 questions (QCM et calculs), correction détaillée pour chaque choix, mauvais choix tirés des pièges de la fiche vigilance, `[hors notes]` sur toute question qui dépasse les notes.

## 5. Contrôler

- `node outils/verifier.mjs` : corriger jusqu'à 0 erreur, et traiter les avertissements qui concernent la séance.
- Relecture contre les consignes, fiche par fiche :
  - tout ajout absent des notes est marqué `[hors notes]` ;
  - aucune correction silencieuse : chaque écart avec les notes a son point V et son renvoi ;
  - les cinq rubriques de vigilance sont remplies ;
  - chaque correction de quiz explique aussi les mauvais choix ;
  - notations du cours respectées ;
  - niveau universitaire.

## 6. Enregistrer les notes traitées

`node outils/registre.mjs <matière> --marquer <id> <fichier>…` pour chaque note utilisée (plusieurs séances : `cm03,td02`). Une note illisible ou non exploitée n'est pas marquée.

## 7. Commiter et pousser (une séance = un commit)

```
git add <matière>/
git commit -m "<matière>: <CM 3> — <titre>" -m "Notes : <fichiers>. Points à vérifier : <n>."
git push -u origin HEAD
```

`git add <matière>/` inclut aussi les notes déposées localement et pas encore commitées. En cas d'échec réseau, réessayer. Si la branche distante a avancé (notes ajoutées entre-temps), faire `git pull --rebase`, relancer le vérificateur, puis pousser.

## 8. Compte rendu à l'étudiant

Pour chaque séance traitée, en quelques lignes :

- séance, titre, notes utilisées ;
- l'essentiel du contenu ;
- nombre de questions du quiz ;
- la liste des points « À vérifier » (numéro, une ligne chacun), pour qu'il puisse les poser au prof ;
- les notes non traitées (illisibles, format inconnu) et pourquoi.

Si la branche courante n'est pas la branche par défaut du dépôt (`git remote show origin`), lui rappeler de la fusionner pour mettre le site en ligne à jour. Sinon, la prochaine session ne verra pas ces notes comme traitées.
