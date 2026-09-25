---
name: question
description: Répond à une question de cours en s'appuyant d'abord sur les notes de la matière, puis ajoute la question et la réponse à la section Questions du site, commite et pousse. Uniquement sur demande explicite (/question).
argument-hint: "[matière] [question]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node outils/registre.mjs:*), Bash(node outils/verifier.mjs:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*)
---

# /question

Arguments reçus : « $ARGUMENTS »

Les consignes de `CLAUDE.md` s'appliquent (notes d'abord, « hors notes » marqué, rien de corrigé en silence).

## 1. Matière et question

- Premier mot = matière (identifiant, alias ou nom). Le reste = la question, à conserver telle quelle (orthographe corrigée au besoin, sens inchangé).
- `node outils/registre.mjs <premier mot>` affiche la matière reconnue, ou la liste des matières si le mot est inconnu.
- Premier mot qui n'est pas une matière, ou question vide : demander à l'étudiant, sans deviner.

## 2. Chercher dans les notes

- Repérer les séances concernées : titres dans `<matière>/matiere.json`, recherche dans `<matière>/seances/*.md`. Chercher aussi dans `<matière>/questions.md` si la question a déjà été posée : y renvoyer et compléter plutôt que répéter.
- Remonter aux notes brutes des séances concernées (`sources` dans `matiere.json`) et vérifier ce qu'elles disent réellement : la fiche est une synthèse, la note est la référence.
- Notes muettes sur la question : le dire explicitement, puis répondre en marquant `[hors notes]`.

## 3. Rédiger la réponse

- Niveau L3 et notations du cours.
- Structure :
  - d'abord la réponse directe, en une à trois phrases ;
  - ensuite le développement : démonstration ou calcul, intuition économique, exemple ;
  - enfin les **Sources** : fichier de notes, page, séance.
- Tout ce qui ne vient pas des notes est marqué `[hors notes]`, ou placé dans un encadré `> [!HORS-NOTES]`.
- Si la question révèle un passage des notes incomplet, ambigu ou faux :
  - le dire dans la réponse ;
  - ajouter un point « À vérifier » (numéro V suivant) dans la fiche vigilance de la séance ;
  - dans la fiche de cours, renvoyer à ce point sans rien corriger en silence.
- Si la question porte sur un point déjà ouvert, y renvoyer (« CM 3, V2 »).
- Si elle révèle une confusion fréquente, l'ajouter aussi à la rubrique adéquate de la fiche vigilance.

## 4. Ajouter à la section Questions

À la fin de `<matière>/questions.md`, au format de `modeles/questions.md` :

```
## <question telle que posée>

*<date du jour, ex. 25 sept. 2026> · <séance(s) concernée(s), ex. CM 3>*

<réponse>

**Sources** : …
```

## 5. Contrôler, commiter, pousser

- `node outils/verifier.mjs` : 0 erreur.
- Commiter et pousser :
  ```
  git add <matière>/
  git commit -m "<matière>: question — <résumé en quelques mots>"
  git push -u origin HEAD
  ```
  Mentionner dans le message de commit un point V ajouté, le cas échéant.

## 6. Répondre dans le chat

Donner la réponse complète, avec le même contenu que dans `questions.md`. Terminer par une ligne qui précise :

- que la question est ajoutée à la section Questions ;
- le cas échéant, le point V ajouté à la fiche vigilance.
