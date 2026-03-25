/**
 * ClearDrop — Web Worker
 * Receives an ImageBitmap, runs the full WatermarkEngine pipeline off the main thread.
 */

import { WatermarkEngine } from '../core/watermarkEngine.js';

let enginePromise = null;

// Lazily initialise the engine (loads bg PNGs once, caches alpha maps)
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

        // Transfer blob back – no copy, fast
        self.postMessage({ id, blob, confidence, position, ok: true });
    } catch (err) {
        self.postMessage({ id, ok: false, error: err.message });
    }
});
