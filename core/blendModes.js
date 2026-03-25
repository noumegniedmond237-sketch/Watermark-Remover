/**
 * Reverse alpha blending — core watermark removal formula.
 * Gemini composites: watermarked = α × logo + (1−α) × original
 * We reverse:        original    = (watermarked − α × logo) / (1−α)
 * Unchanged from upstream GargantuaX/gemini-watermark-remover (MIT).
 */

const ALPHA_NOISE_FLOOR = 3 / 255;
const ALPHA_THRESHOLD = 0.002;
const MAX_ALPHA = 0.99;
const LOGO_VALUE = 255;

/**
 * @param {ImageData}   imageData  – modified in place
 * @param {Float32Array} alphaMap
 * @param {{x,y,width,height}} position
 * @param {{alphaGain?: number}} [options]
 */
export function removeWatermark(imageData, alphaMap, position, options = {}) {
    const { x, y, width, height } = position;
    const alphaGain = Number.isFinite(options.alphaGain) && options.alphaGain > 0
        ? options.alphaGain : 1;

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
            const alphaIdx = row * width + col;
            const rawAlpha = alphaMap[alphaIdx];
            const signalAlpha = Math.max(0, rawAlpha - ALPHA_NOISE_FLOOR) * alphaGain;
            if (signalAlpha < ALPHA_THRESHOLD) continue;

            const alpha = Math.min(rawAlpha * alphaGain, MAX_ALPHA);
            const oneMinusAlpha = 1.0 - alpha;

            for (let c = 0; c < 3; c++) {
                const watermarked = imageData.data[imgIdx + c];
                const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha;
                imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
            }
        }
    }
}
