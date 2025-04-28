// imports
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import * as L from 'leaflet';

// types
interface Coords {
    x: number;
    y: number;
    z: number;
}

interface TileCoords extends Coords {}

interface ElementColor {
    idx: number;
    colorR: number;
    colorG: number;
    colorB: number;
    uiR: number;
    uiG: number;
    uiB: number;
}

// constants
const BASE_ZOOM = 10;
const BASE_SIZE = 512;
const CELLS_PER_TILE = 8;
const MAX_SIZE_PER_CELL = 128;
const MIPMAP_SIZES = [16, 32, 64, 128, 256];
const HEX_COLOR_MIPMAP_SIZES = [16];
const MIN_MIPMAP_SIZE = Math.min(...MIPMAP_SIZES);
const MAX_MIPMAP_SIZE = Math.max(...MIPMAP_SIZES);
const MIN_HEX_COLOR_SIZE = Math.min(...HEX_COLOR_MIPMAP_SIZES);
const MAX_HEX_COLOR_SIZE = Math.max(...HEX_COLOR_MIPMAP_SIZES);
const DEBUG_TILE_TIMING = true; // Enable or disable debug timing

// globals
const initialMap = ref<L.Map | null>(null);
let imageData: ImageData | null = null;
let imageWidth: number | null = null;
let imageHeight: number | null = null;
const colorMap: Record<number, string> = {};
const uiColorMap: Record<number, string> = {};
let elementIndiciesWithImages: number[] = [];
const mipmapCanvases: Record<number, HTMLCanvasElement> = {};
const hexColorCanvases: Record<number, HTMLCanvasElement> = {};
const imageCache = new Map<string, HTMLImageElement>();

// utility functions
async function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        if (imageCache.has(url)) {
            return resolve(imageCache.get(url)!);
        }
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            imageCache.set(url, img);
            resolve(img);
        };
        img.onerror = (err) => reject(err);
        img.src = url;
    });
}

function get_size_from_zoom(zoom: number): number {
    return BASE_SIZE * (2 ** (zoom - BASE_ZOOM));
}

function get_zoom_from_size(size: number): number {
    return Math.log2(size / BASE_SIZE) + BASE_ZOOM;
}

function get_bounded_zoom(zoom: number): number {
    return Math.min(get_zoom_from_size(MAX_SIZE_PER_CELL), zoom);
}

// loading image data
async function loadImageData(): Promise<void> {
    try {
        const response = await fetch('/elementIdx8.png');
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Failed to get canvas context");

        imageWidth = imageBitmap.width;
        imageHeight = imageBitmap.height;

        canvas.width = imageWidth;
        canvas.height = imageHeight;
        ctx.drawImage(imageBitmap, 0, 0);

        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        console.log("Image data loaded successfully!");
    } catch (error) {
        console.error("Error loading image:", error);
    }
}

function getPixelValue(x: number, y: number): number | null {
    if (!imageData) {
        console.error("Image data not loaded!");
        return null;
    }

    if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) {
        return null;
    }

    const index = (y * imageData.width + x) * 4;
    return imageData.data[index];
}

// preload mipmaps
async function preloadMipmaps(): Promise<void> {
    for (const size of MIPMAP_SIZES) {
        const img = await loadImage(`tiles_mipmaps/${size}x${size}.png`);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        mipmapCanvases[size] = canvas;
    }

    for (const size of HEX_COLOR_MIPMAP_SIZES) {
        const img = await loadImage(`/hex_colors_mipmap/${size}x${size}.png`);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        hexColorCanvases[size] = canvas;
    }
}

async function drawTiles(ctx: CanvasRenderingContext2D, coords: Coords, elementID: number): Promise<void> {
    if (!mipmapCanvases[16]) {
        await preloadMipmaps();
    }

    const boundedZoom = get_bounded_zoom(coords.z);
    const scale = get_size_from_zoom(boundedZoom);

    const index = elementIndiciesWithImages.indexOf(elementID);

    if (index === -1) {
        // ❗ Element not found in main mipmaps -> fallback to hex color tiles
        let hexColorScale = scale;
        if (!hexColorCanvases[hexColorScale]) {
            if (scale < MIN_HEX_COLOR_SIZE) {
                hexColorScale = MIN_HEX_COLOR_SIZE;
            } else if (scale > MAX_HEX_COLOR_SIZE) {
                hexColorScale = MAX_HEX_COLOR_SIZE;
            } else {
                console.error("No hex color canvas found for scale", scale);
                hexColorScale = MIN_HEX_COLOR_SIZE;
            }
        }
        const hexColorCanvas = hexColorCanvases[hexColorScale];
        const colorHexX = elementID * hexColorScale;
        const colorHexY = 0;

        const prevImageSmoothingEnabled = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(hexColorCanvas, colorHexX, colorHexY, hexColorScale, hexColorScale, 0, 0, scale, scale);
        ctx.imageSmoothingEnabled = prevImageSmoothingEnabled;
        return;
    }

    // Normal path: found in mipmaps
    const textureSize = scale * CELLS_PER_TILE;
    const boundedTextureSize = Math.min(MAX_MIPMAP_SIZE, Math.max(MIN_MIPMAP_SIZE, textureSize));
    const mipmap = mipmapCanvases[boundedTextureSize];
    if (!mipmap) {
        console.error("No mipmap found for size:", boundedTextureSize);
        return;
    }

    const texturesPerRow = mipmap.width / scale;
    const srcX = (index % texturesPerRow) * textureSize;
    const srcY = Math.floor(index / texturesPerRow) * textureSize;
    const tileIndexX = coords.x % CELLS_PER_TILE;
    const tileIndexY = coords.y % CELLS_PER_TILE;
    const subTileX = srcX + tileIndexX * scale;
    const subTileY = srcY + tileIndexY * scale;

    ctx.drawImage(mipmap, subTileX, subTileY, scale, scale, 0, 0, scale, scale);
}

async function createZoomedTile(coords: Coords, baseSize: number, baseZoom: number): Promise<HTMLCanvasElement> {
    const offCanvas = document.createElement('canvas');
    const ctx = offCanvas.getContext('2d');
    if (!ctx) throw new Error("Failed to create canvas context");

    const zoomDiff = baseZoom - coords.z;
    const gridSize = 2 ** zoomDiff + 1;
    const boundarySize = 2 ** zoomDiff;

    const outputSize = baseSize;
    const subtileSize = outputSize / (gridSize - 1);

    offCanvas.width = outputSize;
    offCanvas.height = outputSize;

    const startWorldX = coords.x * boundarySize;
    const startWorldY = coords.y * boundarySize;

    const startTime = DEBUG_TILE_TIMING ? performance.now() : 0;

    for (let j = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
            const topLeftID = getPixelValue(startWorldX + i, startWorldY + j);
            if (topLeftID !== null) {
                const subCanvas = document.createElement('canvas');
                subCanvas.width = subtileSize;
                subCanvas.height = subtileSize;
                const subCtx = subCanvas.getContext('2d');
                if (!subCtx) continue;

                await drawTiles(subCtx, { x: startWorldX + i, y: startWorldY + j, z: coords.z }, topLeftID);

                ctx.drawImage(subCanvas, i * subtileSize, j * subtileSize, subtileSize, subtileSize);
            }
        }
    }

    if (DEBUG_TILE_TIMING) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        console.log(`createZoomedTile [${coords.x}, ${coords.y}, z=${coords.z}, gridSize=${gridSize}x${gridSize}] took ${duration.toFixed(2)} ms`);
    }

    return offCanvas;
}


async function initializeMap(): Promise<void> {
    if (!initialMap.value) {
        initialMap.value = L.map('map').setView([0, 0], BASE_ZOOM);

        const MyCanvasLayer = L.GridLayer.extend({
            createTile(coords: L.Coords, done: (error: Error | null, tile: HTMLCanvasElement) => void): HTMLCanvasElement {
                const tile = document.createElement('canvas');
                const size = this.getTileSize();
                tile.width = size.x;
                tile.height = size.y;
                const ctx = tile.getContext('2d');
                if (!ctx) throw new Error("Failed to get canvas tile context");

                if (coords.z < BASE_ZOOM) {
                    this.options.tileSize = BASE_SIZE;
                    createZoomedTile(coords, BASE_SIZE, BASE_ZOOM).then((canvas) => {
                        ctx.drawImage(canvas, 0, 0, size.x, size.y);
                        done(null, tile);
                    }).catch(err => {
                        console.error("Error creating zoomed tile:", err);
                        done(err, tile);
                    });
                } else {
                    this.options.tileSize = BASE_SIZE * (2 ** (coords.z - BASE_ZOOM));
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0, size.x, size.y);
                        done(null, tile);
                    };
                    img.onerror = (err) => {
                        console.error("Tile load error", err);
                        done(err instanceof Error ? err : new Error("Tile load error"), tile);
                    };
                    img.src = '/tiles_placeholder.png'; // Placeholder image, adjust as needed
                }

                return tile;
            }
        });

        L.gridLayer.myCanvasLayer = function (options?: L.GridLayerOptions) {
            return new MyCanvasLayer(options);
        } as any;

        L.gridLayer.myCanvasLayer({
            minZoom: 0,
            maxZoom: get_zoom_from_size(MAX_SIZE_PER_CELL),
            tileSize: BASE_SIZE,
            continuousWorld: false,
            noWrap: true,
            crs: L.CRS.Simple,
            worldCopyJump: false
        }).addTo(initialMap.value);

        console.log("Map initialized.");
    }
}

async function loadColorData(): Promise<void> {
    const response = await fetch('/elements.json');
    const elements: ElementColor[] = await response.json();

    elements.forEach(element => {
        const rgbToHex = (r: number, g: number, b: number): string =>
            ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();

        colorMap[element.idx] = rgbToHex(element.colorR, element.colorG, element.colorB);
        uiColorMap[element.idx] = rgbToHex(element.uiR, element.uiG, element.uiB);
    });

    console.log("Color data loaded successfully!");
}

async function loadValidElementIdxImages(): Promise<void> {
    const response = await fetch('/tiles/valid_idxs.json');
    elementIndiciesWithImages = await response.json();
    console.log("Element index image data loaded successfully!");
}

function getColorHexById(idx: number): string {
    return uiColorMap[idx] || "000000";
}

function getTileUrl(coords: Coords): string | null {
    const x = coords.x;
    const y = coords.y;
    const zoom = coords.z;
    const size = get_size_from_zoom(zoom);

    const pixelValue = getPixelValue(x, y);
    if (pixelValue === null) return null;

    if (elementIndiciesWithImages.includes(pixelValue)) {
        return `/tiles_cut/${Math.min(size, MAX_SIZE_PER_CELL)}/${pixelValue}/${x % CELLS_PER_TILE}-${CELLS_PER_TILE - 1 - (y % CELLS_PER_TILE)}.png`;
    }

    const colorHex = getColorHexById(pixelValue);
    return `/hex_colors_32/${colorHex}.png`;
}

export async function initializeApp(): Promise<void> {
    await loadColorData();
    await loadValidElementIdxImages();
    await loadImageData();
    await preloadMipmaps();
    await initializeMap();
    console.log("Application initialized.");
}
