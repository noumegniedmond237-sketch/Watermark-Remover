/**
 * Détection de la taille/position du filigrane.
 * Inchangé par rapport à l'amont GargantuaX/gemini-watermark-remover (MIT).
 */
import { computeRegionSpatialCorrelation } from './adaptiveDetector.js';

export function detectWatermarkConfig(imageWidth, imageHeight) {
    if (imageWidth > 1024 && imageHeight > 1024) {
        return { logoSize: 96, marginRight: 64, marginBottom: 64 };
    }
    return { logoSize: 48, marginRight: 32, marginBottom: 32 };
}

export function calculateWatermarkPosition(imageWidth, imageHeight, config) {
    const { logoSize, marginRight, marginBottom } = config;
    return {
        x: imageWidth - marginRight - logoSize,
        y: imageHeight - marginBottom - logoSize,
        width: logoSize,
        height: logoSize,
    };
}

function getStandardConfig(size) {
    return size === 96
        ? { logoSize: 96, marginRight: 64, marginBottom: 64 }
        : { logoSize: 48, marginRight: 32, marginBottom: 32 };
}

function getAlphaMapForConfig(config, alpha48, alpha96) {
    return config.logoSize === 96 ? alpha96 : alpha48;
}

function isRegionInsideImage(imageData, region) {
    return region.x >= 0 && region.y >= 0 &&
        region.x + region.width <= imageData.width &&
        region.y + region.height <= imageData.height;
}

export function resolveInitialStandardConfig({
    imageData, defaultConfig, alpha48, alpha96,
    minSwitchScore = 0.25, minScoreDelta = 0.08
}) {
    if (!imageData || !defaultConfig || !alpha48 || !alpha96) return defaultConfig;

    const primaryConfig = getStandardConfig(defaultConfig.logoSize);
    const alternateConfig = defaultConfig.logoSize === 96
        ? getStandardConfig(48) : getStandardConfig(96);

    const primaryRegion = calculateWatermarkPosition(imageData.width, imageData.height, primaryConfig);
    const alternateRegion = calculateWatermarkPosition(imageData.width, imageData.height, alternateConfig);

    if (!isRegionInsideImage(imageData, primaryRegion)) return defaultConfig;

    const primaryScore = computeRegionSpatialCorrelation({
        imageData,
        alphaMap: getAlphaMapForConfig(primaryConfig, alpha48, alpha96),
        region: { x: primaryRegion.x, y: primaryRegion.y, size: primaryRegion.width }
    });

    if (!isRegionInsideImage(imageData, alternateRegion)) return primaryConfig;

    const alternateScore = computeRegionSpatialCorrelation({
        imageData,
        alphaMap: getAlphaMapForConfig(alternateConfig, alpha48, alpha96),
        region: { x: alternateRegion.x, y: alternateRegion.y, size: alternateRegion.width }
    });

    return (alternateScore >= minSwitchScore && alternateScore > primaryScore + minScoreDelta)
        ? alternateConfig : primaryConfig;
}
