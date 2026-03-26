<div align="center">

<img src="docs/hero.png" alt="Clear AI Watermark" width="100%">

# Clear AI Watermark

**Supprimez les filigranes Gemini. Mathématiquement. Instantanément.**

[![MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square)](LICENSE)
[![Aucun serveur](https://img.shields.io/badge/serveur-aucun-2d7dd2?style=flat-square)](https://github.com/noumegniedmond237-sketch)
[![0 dépendance](https://img.shields.io/badge/dépendances-0-22c55e?style=flat-square)](package.json)
[![<200ms](https://img.shields.io/badge/vitesse-<200ms-2d7dd2?style=flat-square)](https://github.com/noumegniedmond237-sketch)

[**Essayez en ligne →**](https://removeaiwatermark.rizzler.wtf) · [Signaler un bug](https://github.com/noumegniedmond237-sketch/issues)

</div>

---

## Principe

Gemini compose son filigrane avec un mélange alpha : `watermarked = α × logo + (1−α) × original`

On inverse la formule : `original = (watermarked − α × logo) / (1−α)`

La carte alpha est extraite d'une capture de référence du logo — aucune IA, aucune estimation.

## Fonctionnalités

- **< 200ms** par image — traitement via Web Workers parallèles
- **100% local** — aucune donnée ne quitte votre appareil
- **Par lots** — jusqu'à 50 images, export ZIP en un clic
- **Comparaison** — curseur avant/après glissable
- **Confiance** — score de détection affiché (ex : `✓ 98%`)
- **Collage** — `Ctrl+V` direct depuis le presse-papier
- **Aucune dépendance** — ~20KB JS, zéro npm, zéro build

## Installation

```bash
git clone https://github.com/noumegniedmond237-sketch/Watermark-Remover.git
cd Watermark-Remover
npx serve . --listen 3000
```

Ouvrez [http://localhost:3000](http://localhost:3000)

> Les modules ES nécessitent HTTP — ne fonctionne pas en `file://`.

## Déploiement

Hébergement statique classique, aucune étape de build :

```bash
vercel --prod          # Vercel
netlify deploy --dir . --prod  # Netlify
# ou activer GitHub Pages dans les paramètres du dépôt
```

## Architecture

```
├── index.html              # Interface
├── app.js                  # Logique UI, drag-drop, pool de workers
├── styles.css              # Design (CSS vanilla)
├── core/
│   ├── alphaMap.js         # Extraction carte α
│   ├── blendModes.js       # Mélange alpha inverse
│   ├── watermarkConfig.js  # Détection 48px/96px
│   ├── adaptiveDetector.js # NCC + sortie anticipée ≥90%
│   └── watermarkEngine.js  # Orchestration complète
├── workers/
│   └── watermarkWorker.js  # Exécution hors thread principal
└── assets/
    ├── bg_48.png           # Référence 48×48
    └── bg_96.png           # Référence 96×96
```

## Navigateurs

![Chrome](https://img.shields.io/badge/Chrome-90+-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-88+-FF7139?style=flat-square&logo=firefox&logoColor=white)
![Safari](https://img.shields.io/badge/Safari-14+-006CFF?style=flat-square&logo=safari&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-90+-0078D7?style=flat-square&logo=microsoftedge&logoColor=white)
![iOS](https://img.shields.io/badge/iOS_Safari-14+-000000?style=flat-square&logo=safari&logoColor=white)
![Android](https://img.shields.io/badge/Android_Chrome-90+-3DDC84?style=flat-square&logo=googlechrome&logoColor=white)

## Licence

MIT — voir [LICENSE](LICENSE).
