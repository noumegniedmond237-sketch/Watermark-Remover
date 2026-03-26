/**
 * WatermarkEngine — orchestre la détection, le chargement des cartes alpha et la suppression.
 * Basé sur GargantuaX/gemini-watermark-remover (MIT). Sortie anticipée branchée via adaptiveDetector.
 */

import { calculateAlphaMap } from './alphaMap.js';
import { removeWatermark } from './blendModes.js';
import {
    computeRegionSpatialCorrelation,
    computeRegionGradientCorrelation,
    detectAdaptiveWatermarkRegion,
    interpolateAlphaMap,
    warpAlphaMap,
    shouldAttemptAdaptiveFallback,
} from './adaptiveDetector.js';
import {
    detectWatermarkConfig,
    calculateWatermarkPosition,
    resolveInitialStandardConfig,
} from './watermarkConfig.js';

// Encoder les PNG en littéraux base64 au moment de la construction — zéro requête réseau pour les ressources.
// Nous les chargeons via fetch depuis /assets/ dans le contexte du Web Worker.
export const BG_48_URL = new URL('../assets/bg_48.png', import.meta.url).href;
export const BG_96_URL = new URL('../assets/bg_96.png', import.meta.url).href;

const RESIDUAL_RECALIBRATION_THRESHOLD = 0.5;
const MIN_SUPPRESSION_FOR_SKIP_RECALIBRATION = 0.18;
const MIN_RECALIBRATION_SCORE_DELTA = 0.18;
const NEAR_BLACK_THRESHOLD = 5;
const MAX_NEAR_BLACK_RATIO_INCREASE = 0.05;
const OUTLINE_REFINEMENT_THRESHOLD = 0.42;
const OUTLINE_REFINEMENT_MIN_GAIN = 1.2;
const TEMPLATE_ALIGN_SHIFTS = [-0.5, -0.25, 0, 0.25, 0.5];
const TEMPLATE_ALIGN_SCALES = [0.99, 1, 1.01];
const SUBPIXEL_REFINE_SHIFTS = [-0.25, 0, 0.25];
const SUBPIXEL_REFINE_SCALES = [0.99, 1, 1.01];
const ALPHA_GAIN_CANDIDATES = [1.05, 1.12, 1.2, 1.28, 1.36, 1.45, 1.52, 1.6, 1.7, 1.85, 2.0, 2.2, 2.4, 2.6];

function createRuntimeCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        return canvas;
    }
    throw new Error('Moteur Canvas non disponible');
}

function getCanvasContext2D(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Échec de l\'obtention du contexte Canvas 2D');
    return ctx;
}

async function loadBackgroundCapture(url) {
    if (typeof createImageBitmap !== 'undefined' && typeof fetch !== 'undefined') {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Échec du chargement de la capture de fond : ${response.status}`);
        const blob = await response.blob();
        return createImageBitmap(blob);
    }
    if (typeof Image !== 'undefined') {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }
    throw new Error('Aucun chargeur d\'image disponible');
}

function cloneImageData(imageData) {
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function shouldRecalibrateAlphaStrength({ originalScore, processedScore, suppressionGain }) {
    return originalScore >= 0.6 &&
        processedScore >= RESIDUAL_RECALIBRATION_THRESHOLD &&
        suppressionGain <= MIN_SUPPRESSION_FOR_SKIP_RECALIBRATION;
}

function calculateNearBlackRatio(imageData, position) {
    let nearBlack = 0, total = 0;
    for (let row = 0; row < position.height; row++) {
        for (let col = 0; col < position.width; col++) {
            const idx = ((position.y + row) * imageData.width + (position.x + col)) * 4;
            if (imageData.data[idx] <= NEAR_BLACK_THRESHOLD && imageData.data[idx + 1] <= NEAR_BLACK_THRESHOLD && imageData.data[idx + 2] <= NEAR_BLACK_THRESHOLD) nearBlack++;
            total++;
        }
    }
    return total > 0 ? nearBlack / total : 0;
}

function findBestTemplateWarp({ originalImageData, alphaMap, position, baselineSpatialScore, baselineGradientScore }) {
    const size = position.width;
    if (!size || size <= 8) return null;
    let best = { spatialScore: baselineSpatialScore, gradientScore: baselineGradientScore, shift: { dx: 0, dy: 0, scale: 1 }, alphaMap };

    for (const scale of TEMPLATE_ALIGN_SCALES) {
        for (const dy of TEMPLATE_ALIGN_SHIFTS) {
            for (const dx of TEMPLATE_ALIGN_SHIFTS) {
                if (dx === 0 && dy === 0 && scale === 1) continue;
                const warped = warpAlphaMap(alphaMap, size, { dx, dy, scale });
                const spatialScore = computeRegionSpatialCorrelation({ imageData: originalImageData, alphaMap: warped, region: { x: position.x, y: position.y, size } });
                const gradientScore = computeRegionGradientCorrelation({ imageData: originalImageData, alphaMap: warped, region: { x: position.x, y: position.y, size } });
                const confidence = Math.max(0, spatialScore) * 0.7 + Math.max(0, gradientScore) * 0.3;
                const bestConf = Math.max(0, best.spatialScore) * 0.7 + Math.max(0, best.gradientScore) * 0.3;
                if (confidence > bestConf + 0.01) best = { spatialScore, gradientScore, shift: { dx, dy, scale }, alphaMap: warped };
            }
        }
    }
    const improvedSpatial = best.spatialScore >= baselineSpatialScore + 0.01;
    const improvedGradient = best.gradientScore >= baselineGradientScore + 0.01;
    return improvedSpatial || improvedGradient ? best : null;
}

function refineSubpixelOutline({ originalImageData, alphaMap, position, alphaGain, originalNearBlackRatio, baselineSpatialScore, baselineGradientScore, baselineShift }) {
    const size = position.width;
    if (!size || size <= 8 || alphaGain < OUTLINE_REFINEMENT_MIN_GAIN) return null;

    const maxAllowedNearBlackRatio = Math.min(1, originalNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);
    const gainCandidates = [alphaGain];
    const lower = Math.max(1, Number((alphaGain - 0.01).toFixed(2)));
    const upper = Number((alphaGain + 0.01).toFixed(2));
    if (lower !== alphaGain) gainCandidates.push(lower);
    if (upper !== alphaGain) gainCandidates.push(upper);

    const baseDx = baselineShift?.dx ?? 0;
    const baseDy = baselineShift?.dy ?? 0;
    const baseScale = baselineShift?.scale ?? 1;

    let best = null;
    for (const scaleDelta of SUBPIXEL_REFINE_SCALES) {
        const scale = Number((baseScale * scaleDelta).toFixed(4));
        for (const dyDelta of SUBPIXEL_REFINE_SHIFTS) {
            const dy = baseDy + dyDelta;
            for (const dxDelta of SUBPIXEL_REFINE_SHIFTS) {
                const dx = baseDx + dxDelta;
                const warped = warpAlphaMap(alphaMap, size, { dx, dy, scale });
                for (const gain of gainCandidates) {
                    const candidate = cloneImageData(originalImageData);
                    removeWatermark(candidate, warped, position, { alphaGain: gain });
                    const nearBlackRatio = calculateNearBlackRatio(candidate, position);
                    if (nearBlackRatio > maxAllowedNearBlackRatio) continue;
                    const spatialScore = computeRegionSpatialCorrelation({ imageData: candidate, alphaMap: warped, region: { x: position.x, y: position.y, size } });
                    const gradientScore = computeRegionGradientCorrelation({ imageData: candidate, alphaMap: warped, region: { x: position.x, y: position.y, size } });
                    const cost = Math.abs(spatialScore) * 0.6 + Math.max(0, gradientScore);
                    if (!best || cost < best.cost) best = { imageData: candidate, alphaMap: warped, alphaGain: gain, shift: { dx, dy, scale }, spatialScore, gradientScore, nearBlackRatio, cost };
                }
            }
        }
    }

    if (!best) return null;
    if (!(best.gradientScore <= baselineGradientScore - 0.04 && Math.abs(best.spatialScore) <= Math.abs(baselineSpatialScore) + 0.08)) return null;
    return best;
}

function recalibrateAlphaStrength({ originalImageData, alphaMap, position, originalSpatialScore, processedSpatialScore, originalNearBlackRatio }) {
    let bestScore = processedSpatialScore, bestGain = 1, bestImageData = null;
    const maxAllowed = Math.min(1, originalNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);

    const tryGain = (gain) => {
        const candidate = cloneImageData(originalImageData);
        removeWatermark(candidate, alphaMap, position, { alphaGain: gain });
        if (calculateNearBlackRatio(candidate, position) > maxAllowed) return;
        const score = computeRegionSpatialCorrelation({ imageData: candidate, alphaMap, region: { x: position.x, y: position.y, size: position.width } });
        if (score < bestScore) { bestScore = score; bestGain = gain; bestImageData = candidate; }
    };

    for (const gain of ALPHA_GAIN_CANDIDATES) tryGain(gain);
    for (let delta = -0.05; delta <= 0.05; delta += 0.01) {
        const gain = Number((bestGain + delta).toFixed(2));
        if (gain > 1 && gain < 3) tryGain(gain);
    }

    const scoreDelta = processedSpatialScore - bestScore;
    if (!bestImageData || scoreDelta < MIN_RECALIBRATION_SCORE_DELTA) return null;
    return { imageData: bestImageData, alphaGain: bestGain, processedSpatialScore: bestScore, suppressionGain: originalSpatialScore - bestScore };
}

/** Classe principale du moteur */
export class WatermarkEngine {
    constructor(bgCaptures) {
        this.bgCaptures = bgCaptures;
        this.alphaMaps = {};
    }

    static async create(bg48Url = BG_48_URL, bg96Url = BG_96_URL) {
        const [bg48, bg96] = await Promise.all([
            loadBackgroundCapture(bg48Url),
            loadBackgroundCapture(bg96Url),
        ]);
        return new WatermarkEngine({ bg48, bg96 });
    }

    async getAlphaMap(size) {
        if (size !== 48 && size !== 96) {
            if (this.alphaMaps[size]) return this.alphaMaps[size];
            const alpha96 = await this.getAlphaMap(96);
            const interpolated = interpolateAlphaMap(alpha96, 96, size);
            this.alphaMaps[size] = interpolated;
            return interpolated;
        }
        if (this.alphaMaps[size]) return this.alphaMaps[size];

        const bgImage = size === 48 ? this.bgCaptures.bg48 : this.bgCaptures.bg96;
        const canvas = createRuntimeCanvas(size, size);
        const ctx = getCanvasContext2D(canvas);
        ctx.drawImage(bgImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, size, size);
        const alphaMap = calculateAlphaMap(imageData);
        this.alphaMaps[size] = alphaMap;
        return alphaMap;
    }

    async processImage(imageBitmap) {
        // Dessiner le bitmap sur un OffscreenCanvas pour obtenir les ImageData
        const canvas = createRuntimeCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = getCanvasContext2D(canvas);
        ctx.drawImage(imageBitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const { width, height } = imageData;

        // Charger les deux cartes alpha pour la résolution de la configuration
        const [alpha48, alpha96] = await Promise.all([this.getAlphaMap(48), this.getAlphaMap(96)]);

        // Déterminer la configuration standard
        const defaultConfig = detectWatermarkConfig(width, height);
        const config = resolveInitialStandardConfig({ imageData, defaultConfig, alpha48, alpha96 });
        const position = calculateWatermarkPosition(width, height, config);
        const alphaMap = config.logoSize === 96 ? alpha96 : alpha48;

        // Détection adaptative (sortie anticipée branchée dans adaptiveDetector.js)
        const adaptiveResult = detectAdaptiveWatermarkRegion({ imageData, alpha96, defaultConfig: config });
        const finalPosition = adaptiveResult.found
            ? { x: adaptiveResult.region.x, y: adaptiveResult.region.y, width: adaptiveResult.region.size, height: adaptiveResult.region.size }
            : position;
        const finalAlphaMap = adaptiveResult.found
            ? await this.getAlphaMap(adaptiveResult.region.size)
            : alphaMap;

        // Mesurer le score de base avant la suppression
        const originalSpatialScore = computeRegionSpatialCorrelation({
            imageData, alphaMap: finalAlphaMap,
            region: { x: finalPosition.x, y: finalPosition.y, size: finalPosition.width }
        });

        // Raffinement par déformation de modèle
        const baselineGradientScore = computeRegionGradientCorrelation({
            imageData, alphaMap: finalAlphaMap,
            region: { x: finalPosition.x, y: finalPosition.y, size: finalPosition.width }
        });
        const warpResult = findBestTemplateWarp({
            originalImageData: imageData, alphaMap: finalAlphaMap, position: finalPosition,
            baselineSpatialScore: originalSpatialScore, baselineGradientScore
        });
        const bestAlphaMap = warpResult ? warpResult.alphaMap : finalAlphaMap;
        const bestShift = warpResult ? warpResult.shift : { dx: 0, dy: 0, scale: 1 };

        // Première passe de suppression
        const processed = cloneImageData(imageData);
        removeWatermark(processed, bestAlphaMap, finalPosition);

        const originalNearBlackRatio = calculateNearBlackRatio(imageData, finalPosition);
        const processedSpatialScore = computeRegionSpatialCorrelation({
            imageData: processed, alphaMap: bestAlphaMap,
            region: { x: finalPosition.x, y: finalPosition.y, size: finalPosition.width }
        });
        const suppressionGain = originalSpatialScore - processedSpatialScore;

        let result = processed;
        let finalAlphaGain = 1;

        // Recalibrer la force alpha si nécessaire
        if (shouldRecalibrateAlphaStrength({ originalScore: originalSpatialScore, processedScore: processedSpatialScore, suppressionGain })) {
            const recalibrated = recalibrateAlphaStrength({
                originalImageData: imageData, alphaMap: bestAlphaMap, position: finalPosition,
                originalSpatialScore, processedSpatialScore, originalNearBlackRatio
            });
            if (recalibrated) {
                result = recalibrated.imageData;
                finalAlphaGain = recalibrated.alphaGain;
            }
        }

        // Raffinement subpixel du contour
        if (finalAlphaGain >= OUTLINE_REFINEMENT_THRESHOLD) {
            const refined = refineSubpixelOutline({
                originalImageData: imageData, alphaMap: bestAlphaMap, position: finalPosition,
                alphaGain: finalAlphaGain, originalNearBlackRatio,
                baselineSpatialScore: processedSpatialScore, baselineGradientScore,
                baselineShift: bestShift
            });
            if (refined) result = refined.imageData;
        }

        // Score de confiance pour l'interface utilisateur
        const confidence = adaptiveResult.found ? adaptiveResult.confidence : Math.max(0, Math.min(1, originalSpatialScore));

        // Écrire le résultat sur le canvas et renvoyer le blob
        ctx.putImageData(result, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });

        return { blob, confidence, position: finalPosition };
    }
}
