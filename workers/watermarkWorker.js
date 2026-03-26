/**
 * ClearDrop — Web Worker
 * Reçoit un ImageBitmap, exécute le pipeline complet WatermarkEngine hors du thread principal.
 */

import { WatermarkEngine } from '../core/watermarkEngine.js';

let enginePromise = null;

// Initialiser paresseusement le moteur (charge les PNG de fond une seule fois, met en cache les cartes alpha)
function getEngine(bg48Url, bg96Url) {
    if (!enginePromise) {
        enginePromise = WatermarkEngine.create(bg48Url, bg96Url);
    }
    return enginePromise;
}

self.addEventListener('message', async (event) => {
    const { id, imageBitmap, bg48Url, bg96Url } = event.data;

    try {
        const engine = await getEngine(bg48Url, bg96Url);
        const { blob, confidence, position } = await engine.processImage(imageBitmap);

        // Renvoyer le blob — sans copie, rapide
        self.postMessage({ id, blob, confidence, position, ok: true });
    } catch (err) {
        self.postMessage({ id, ok: false, error: err.message });
    }
});
