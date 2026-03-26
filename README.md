<div align="center">

<img src="docs/hero.png" alt="Clear AI Watermark — Supprimez les filigranes Gemini" width="100%">

<br/>

# Clear AI Watermark

**Supprimez les filigranes Gemini AI. Mathématiquement. Instantanément.**

[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square)](LICENSE)
[![Pas de serveur](https://img.shields.io/badge/serveur-aucun-2d7dd2?style=flat-square&logo=shield&logoColor=white)](https://github.com/noumegniedmond237-sketch)
[![Zéro dépendances](https://img.shields.io.badge/JS_deps-0-22c55e?style=flat-square)](package.json)
[![Navigateur](https://img.shields.io/badge/s_exécute_dans-navigateur-f59e0b?style=flat-square&logo=googlechrome&logoColor=white)](https://github.com/noumegniedmond237-sketch)
[![Traitement](https://img.shields.io/badge/vitesse-%3C200ms-2d7dd2?style=flat-square)](https://github.com/noumegniedmond237-sketch)

<br/>

[**Essayez en ligne →**](https://removeaiwatermark.rizzler.wtf) &nbsp;·&nbsp;
[Signaler un bug](https://github.com/noumegniedmond237-sketch/issues) &nbsp;·&nbsp;
[Demander une fonctionnalité](https://github.com/noumegniedmond237-sketch/issues)

</div>

---

## Qu'est-ce que c'est ?

Google Gemini appose un logo semi-transparent sur chaque image générée par IA. Clear AI Watermark le supprime **mathématiquement** — en utilisant l'inverse exact de la formule de composition alpha de Gemini. Pas de devinette d'IA. Pas de serveur. Pas d'inscription.

Tout s'exécute dans votre navigateur. Vos images ne quittent jamais votre appareil.

---

## Fonctionnalités en un coup d'œil

| | Fonctionnalité | Détail |
|---|---|---|
| ⚡ | **Traitement instantané** | < 200ms par image sur ordinateur |
| 🔒 | **100% privé** | Zéro requête réseau pour les données d'image |
| 📦 | **Traitement par lots** | Jusqu'à 50 images à la fois, Web Workers parallèles |
| 🗜️ | **Export ZIP** | Téléchargez toutes les images nettoyées en un clic |
| 🔍 | **Curseur Avant/Après** | Glissez pour comparer l'original vs nettoyé |
| 🎯 | **Score de confiance** | Voyez à quel point le moteur est certain (ex: `✓ 98%`) |
| 📐 | **Variantes 48px & 96px** | Gère les deux tailles de filigrane Gemini actuelles |
| 📋 | **Support du collage** | `Cmd/Ctrl + V` pour coller les images du presse-papier |
| 🐈 | **Interface légère** | Mascotte chat en CSS pur + métriques utilisateurs en direct |
| 🪶 | **~20KB JS initial** | Moteur principal — zéro surcharge au chargement |

---

## Captures d'écran

<details open>
<summary><strong>Interface principale — Téléchargement</strong></summary>
<br/>

![Interface principale Clear AI Watermark](docs/hero.png)

</details>

<details>
<summary><strong>Comment ça marche — Algorithme expliqué</strong></summary>
<br/>

![Comment ça marche](docs/how-it-works.png)

</details>

<details>
<summary><strong>Aperçu de la page complète</strong></summary>
<br/>

![Page complète](docs/full-page.png)

</details>

---

## Comment ça marche

Gemini compose le filigrane en utilisant le **mélange alpha** standard :

```
watermarked = α × logo + (1 − α) × original
```

Clear AI Watermark résout pour `original` en inversant cela :

```
original = (watermarked − α × logo) / (1 − α)
```

La carte alpha (`α`) est calculée à partir d'une capture de référence pure du logo de filigrane Gemini — pas d'estimation, pas de modèle ML.

### Pipeline de détection

```
Image en entrée
│
▼
detectWatermarkConfig() → 48px ou 96px selon les dimensions de l'image
│
▼
resolveInitialStandardConfig() → Vérification de configuration basée sur NCC (bascule 48↔96 si nécessaire)
│
▼
detectAdaptiveWatermarkRegion() → Balayage multi-échelle grossier-vers-fin
│ └── SORTIE ANTICIPÉE à ≥ 90% de confiance (saute le balayage exhaustif)
▼
findBestTemplateWarp() → Raffinement d'alignement sous-pixel (dx, dy, échelle)
│
▼
removeWatermark() → Applique le mélange alpha inverse par pixel
│
▼
recalibrateAlphaStrength() → Relance avec gain α optimisé si résidu restant
│
▼
Blob PNG de sortie
```

---

## Architecture

```
nanobanana-watermark-remover/
├── index.html ← Shell de l'application, SEO, attribution MIT
├── styles.css ← Système de design (inspiré de SideShift, CSS vanilla)
├── app.js ← UI, glisser-déposer, pool de workers, file de lots
│
├── core/
│ ├── alphaMap.js ← Extrait la carte α de la capture de référence
│ ├── blendModes.js ← Formule de mélange alpha inverse
│ ├── watermarkConfig.js ← Détecte 48px/96px, calcule la position
│ ├── adaptiveDetector.js ← Moteur NCC + optimisation de sortie anticipée ★
│ └── watermarkEngine.js ← Orchestrateur : détecte → recalibre → supprime
│
├── workers/
│ └── watermarkWorker.js ← Web Worker (parallèle, hors du thread principal)
│
└── assets/
├── bg_48.png ← Capture de référence Gemini 48×48 (1.6KB)
└── bg_96.png ← Capture de référence Gemini 96×96 (8.1KB)
```

**★ Optimisation clé ajoutée par rapport à l'amont :** `adaptiveDetector.js` court-circuite maintenant lorsque le score de confiance NCC atteint ≥ 90% — arrêtant le balayage exhaustif de plus de 100 passes plus tôt. Cela rend le traitement des images Gemini typiques **30–60% plus rapide** sans aucune perte de précision sur les cas standards.

---

## Performance

| Métrique | Cible | Notes |
|---|---|---|
| JS initial (gzippé) | < 30KB | Moteur principal uniquement — jszip est chargé à la demande |
| Temps jusqu'à interactif (3G) | < 1s | Pas de dépendances de démarrage asynchrones |
| Image unique (ordinateur) | < 200ms | Web Worker, createImageBitmap() |
| Lot de 10 images (ordinateur) | < 3s | 2–4 workers parallèles |
| ZIP de 10 images | < 1s | Après chargement différé de jszip |
| Mémoire pic (10 images) | < 200MB | GC des bitmaps après chaque tâche |

---

## Pour commencer

### Exécuter localement

```bash
# Cloner
git clone https://github.com/noumegniedmond237-sketch.git
cd nanobanana-watermark-remover

# Servir (n'importe quel serveur statique fonctionne — les modules ES ont besoin de HTTP, pas de file://)
npx serve . --listen 3000
# ou : python3 -m http.server 3000
```

Ouvrez [http://localhost:3000](http://localhost:3000)

> **Note :** Vous devez servir via HTTP — les modules ES ne se chargeront pas depuis les URLs `file://` en raison des restrictions CORS du navigateur.

### Déployer

Fonctionne sur n'importe quel hôte statique sans étape de construction requise :

```bash
# Netlify CLI
netlify deploy --dir . --prod

# Vercel
vercel --prod

# GitHub Pages — poussez simplement, activez Pages dans les paramètres du dépôt
```

---

## Support des navigateurs

| Navigateur | Supporté | Notes |
|---|---|---|
| Chrome 90+ | ✅ | Complet — OffscreenCanvas + Web Workers |
| Firefox 88+ | ✅ | Complet |
| Safari 14+ | ✅ | Complet |
| Edge 90+ | ✅ | Complet |
| iOS Safari 14+ | ✅ | Fonctionnel — plus lent sur matériel ancien |
| Android Chrome 90+ | ✅ | Complet |

---

## Attribution (MIT)

Ce projet s'appuie sur l'excellent travail amont de :

- **[GargantuaX/gemini-watermark-remover](https://github.com/GargantuaX/gemini-watermark-remover)** — Algorithme principal, captures de référence de carte alpha, détecteur NCC adaptatif (MIT © 2025)
- **[Kwyshell/GeminiWatermarkTool](https://github.com/dinoBOLT/Gemini-Watermark-Remover)** — Recherche originale sur les filigranes (MIT © 2024)

Ajouts dans ce fork :
- Détection avec sortie anticipée (amélioration de vitesse de 30–60%)
- Interface repensée (inspirée de SideShift, CSS vanilla)
- Vrai traitement par lots parallèle avec pool de workers
- Chemin de décodage plus rapide avec `createImageBitmap()`
- `import()` différé pour jszip (−100KB de chargement initial)
- Affichage du score de confiance + curseur de comparaison avant/après
- Support du collage depuis le presse-papier

---

## Licence

MIT — voir [LICENSE](LICENSE) pour le texte complet.

```
Copyright (c) 2026 eriven

Permission est accordée, gratuitement, à toute personne obtenant une copie
de ce logiciel et des fichiers de documentation associés (le "Logiciel"), de traiter
dans le Logiciel sans restriction, y compris sans s'limite les droits
d'utiliser, copier, modifier, fusionner, publier, distribuer, sous-licencier et/ou vendre
des copies du Logiciel, et de permettre aux personnes auxquelles le Logiciel est fourni
de le faire, sous réserve des conditions suivantes :

L'avis de droit d'auteur ci-dessus et cet avis de permission doivent être inclus dans toutes
les copies ou portions substantielles du Logiciel.
```
