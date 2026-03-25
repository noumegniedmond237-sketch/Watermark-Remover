/**
 * Alpha Map calculator
 * Calculates alpha map from captured background image.
 * Unchanged from upstream GargantuaX/gemini-watermark-remover (MIT).
 */
export function calculateAlphaMap(bgCaptureImageData) {
    const { width, height, data } = bgCaptureImageData;
    const alphaMap = new Float32Array(width * height);
    for (let i = 0; i < alphaMap.length; i++) {
        const idx = i * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        alphaMap[i] = Math.max(r, g, b) / 255.0;
    }
    return alphaMap;
}
