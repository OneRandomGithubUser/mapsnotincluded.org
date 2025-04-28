<template>
  <div class="iframe-container">
    <iframe ref="iframeRef" :src="iframeUrl" frameborder="0" allow="clipboard-read; clipboard-write; cross-origin-isolated"></iframe>
  </div>
  <div>
   <h3>Map!</h3>
   <div id="map" style="height:90vh;"></div>
</div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import { useUserStore } from '@/stores';

import "leaflet/dist/leaflet.css"
import * as L from 'leaflet';

import WebGL2Proxy from "@/components/WebGL2WebWorkerProxy";// "@/components/WebGL2.ts";
import {loadImagesAsync} from "@/components/LoadImage"; // Import the class

const initialMap = ref(null);

let imageData = null; // Store image data globally
let imageWidth = null;
let imageHeight = null;

// Load image data before initializing the map
async function loadImageData() {
    const imageUrl = '/elementIdx8.png';

    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        imageWidth = imageBitmap.width;
        imageHeight = imageBitmap.height;

        canvas.width = imageWidth;
        canvas.height = imageHeight;

        ctx.drawImage(imageBitmap, 0, 0);

        // Store image data globally for fast access
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        console.log("Image data loaded successfully!");
    } catch (error) {
        console.error("Error loading image:", error);
    }
}

// Function to get pixel value from preloaded image data
function getPixelValue(x, y) {
    if (!imageData) {
      console.error("not loaded!");
      return null; // Return null if not loaded
    }

    const width = imageData.width;
    const height = imageData.height;

    // Check if coordinates are within bounds
    if (x < 0 || x >= width || y < 0 || y >= height) {
        // console.log("Coordinates out of bounds:", x, y);
        return null; // Return null if out of bounds
    }

    const index = (y * width + x) * 4; // RGBA array, 4 values per pixel

    return imageData.data[index]; // Take Red channel (Greyscale Image)
}

function getAlphaMask(bitmask, boundarySize, maskCanvas) {
  // TODO: preload
    // Create a small offscreen canvas for the alpha mask
    const maskCtx = maskCanvas.getContext('2d');

    // We'll build raw RGBA data. By default, RGBA = (0, 0, 0, 0).
    const data = new Uint8ClampedArray(boundarySize * boundarySize * 4);

    // For each pixel in boundarySize×boundarySize, decide if it’s
    // in top-left (bit 1), top-right (bit 2), bottom-left (bit 4),
    // or bottom-right (bit 8). We do simple nearest-neighbor logic:
    for (let row = 0; row < boundarySize; row++) {
        for (let col = 0; col < boundarySize; col++) {
            // Figure out which of the 4 corners this pixel belongs to:
            let cornerBit = 0;
            const half = boundarySize / 2;
            const top = (row < half);
            const left = (col < half);

            if (top && left) {
                cornerBit = 1;  // top-left
            } else if (top && !left) {
                cornerBit = 2;  // top-right
            } else if (!top && left) {
                cornerBit = 4;  // bottom-left
            } else {
                cornerBit = 8;  // bottom-right
            }

            // If this corner is in bitmask, alpha=255; else 0
            const alpha = (bitmask & cornerBit) ? 255 : 0;
            const idx = (row * boundarySize + col) * 4;
            data[idx]     = 0;   // R
            data[idx + 1] = 0;   // G
            data[idx + 2] = 0;   // B
            data[idx + 3] = alpha;
        }
    }

    // Put the pixel data back into the mask canvas
    const maskData = new ImageData(data, boundarySize, boundarySize);
    maskCtx.putImageData(maskData, 0, 0);

    //console.log("draw alpha mask", maskCanvas.toDataURL("image/png")); // TODO: make sure all data URLs are cleaned up

    //return maskCanvas;
}

const DISABLE_MEASURE_ZOOMED_TILE_TIME = false;
const DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 = false;
const DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_2 = false;
const DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_1 = false;

async function createZoomedTile({ x, y, z }, BASE_SIZE, BASE_ZOOM) {
    let performanceMetrics = "";
    const timeStart = DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performance.now();
    DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : console.log("start createZoomedTile");

    const scale = get_map_units_per_cell_from_zoom(z);
    const gridSize = get_cells_per_zoom_0_map_tile_from_zoom(z) + 1;
    const boundarySize = get_cells_per_zoom_0_map_tile_from_zoom(z);

    // Offscreen canvas for final output
    const offCanvas = document.createElement('canvas');
    offCanvas.width = boundarySize * scale;
    offCanvas.height = boundarySize * scale;
    const offCtx = offCanvas.getContext('2d');
    offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);

    // Alpha mask canvas
    const alphaMaskCanvas = document.createElement('canvas');
    alphaMaskCanvas.width = scale;
    alphaMaskCanvas.height = scale;
    const alphaMaskCtx = alphaMaskCanvas.getContext('2d');
    alphaMaskCtx.globalCompositeOperation = 'source-over';

    const startWorldX = x * boundarySize;
    const startWorldY = y * boundarySize;

    // **Step 1: Preload all tile images in parallel**
    const tilePromises = [];
    const tileCoords = [];

    for (let j = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
            const topLeftID     = getPixelValue(startWorldX + i, startWorldY + j);
            const topRightID    = getPixelValue(startWorldX + i+1, startWorldY + j);
            const bottomLeftID  = getPixelValue(startWorldX + i, startWorldY + j+1);
            const bottomRightID = getPixelValue(startWorldX + i+1, startWorldY + j+1);

            if (topLeftID === null || topRightID === null || bottomLeftID === null || bottomRightID === null) {
                continue;
            }

            // Determine unique IDs and bitmasks
            const cornerMap = new Map();
            function setCorner(id, bit) {
                if (!cornerMap.has(id)) {
                    cornerMap.set(id, 0);
                }
                cornerMap.set(id, cornerMap.get(id) | bit);
            }
            setCorner(topLeftID, 1);
            setCorner(topRightID, 2);
            setCorner(bottomLeftID, 4);
            setCorner(bottomRightID, 8);

            for (const [elementID, bitmask] of cornerMap.entries()) {
                const offsetCoords = { x: startWorldX + i, y: startWorldY + j, z };
                const tileUrl = getOffsetTileUrl(offsetCoords, elementID);
                tileCoords.push({ i, j, elementID, bitmask, offsetCoords });

                //tilePromises.push(
                //    fetch(tileUrl)
                //        .then(response => response.blob())
                //        .then(blob => createImageBitmap(blob)) // Use ImageBitmap for faster drawing
                //);
            }
        }
    }

    const loadedTiles = await Promise.all(tilePromises); // Load all images in parallel

    // **Step 2: Ensure drawing completes before returning**
    await new Promise(resolve => {
        requestAnimationFrame(() => {
            tileCoords.forEach(({ i, j, elementID, bitmask, offsetCoords }, index) => {
                const img = loadedTiles[index];

                // Generate alpha mask for this tile
                getAlphaMask(bitmask, scale, alphaMaskCanvas);

                // Draw tile onto alphaMaskCanvas
                alphaMaskCtx.clearRect(0, 0, scale, scale);
                drawTiles(alphaMaskCtx, offsetCoords, elementID);

                // Composite the final masked image onto the output canvas
                offCtx.drawImage(alphaMaskCanvas, i * scale, j * scale);
            });

            resolve(); // Resolve the promise once rendering is complete
        });
    });

    const timeEnd = DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performance.now();
    DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performanceMetrics += ["total createZoomedTile", timeEnd - timeStart].join(" ") + "\n";
    if (!DISABLE_MEASURE_ZOOMED_TILE_TIME) {
        console.log(performanceMetrics);
    }

    return offCanvas;
}


// Preload all mipmap images into an object
const mipmapCanvases = {};
const MIPMAP_SIZES = [16, 32, 64, 128, 256];
const MIN_MIPMAP_SIZE = Math.min(...MIPMAP_SIZES);
const MAX_MIPMAP_SIZE = Math.max(...MIPMAP_SIZES);
const hexColorCanvases = {};
const HEX_COLOR_MIPMAP_SIZES = [16];// [16, 32, 64];
const MIN_HEX_COLOR_SIZE = Math.min(...HEX_COLOR_MIPMAP_SIZES);
const MAX_HEX_COLOR_SIZE = Math.max(...HEX_COLOR_MIPMAP_SIZES);
async function preloadMipmaps() {
    for (let size of MIPMAP_SIZES) {
        const img = await loadImage(`tiles_mipmaps/${size}x${size}.png`);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        mipmapCanvases[size] = canvas;
    }
    for (let size of HEX_COLOR_MIPMAP_SIZES) {
        const img = await loadImage(`/hex_colors_mipmap/${size}x${size}.png`);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        hexColorCanvases[size] = canvas;
    }
}

async function drawTiles(canvasCtx, offsetCoords, elementID) {
    if (!mipmapCanvases[16]) {
        await preloadMipmaps();
    }
    const boundedZoom = get_bounded_zoom(offsetCoords.z);
    const scale = get_map_units_per_cell_from_zoom(boundedZoom);

    // Find element index in sorted list
    const index = elementIndiciesWithImages.indexOf(elementID);
    if (index === -1) {
      // If elementID is not found, use the UI color
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
      let hexColorCanvas = hexColorCanvases[hexColorScale];
      const colorHexX = elementID * hexColorScale; // TODO: assumption that every element ID will have a ui color
      const colorHexY = 0;
      // draw onto canvasCtx using nearest-neighbor interpolation
      const prevImageSmoothingEnabled = canvasCtx.imageSmoothingEnabled;
      canvasCtx.imageSmoothingEnabled = false;
      canvasCtx.drawImage(hexColorCanvas, colorHexX, colorHexY, hexColorScale, hexColorScale, 0, 0, scale, scale);
      canvasCtx.imageSmoothingEnabled = prevImageSmoothingEnabled;
      return;
    }

    // Determine mipmap size
    const textureSize = scale * CELLS_PER_NATURAL_TEXTURE_TILE;
    const boundedTextureSize = Math.min(MAX_MIPMAP_SIZE, Math.max(MIN_MIPMAP_SIZE, textureSize));
    const mipmap = mipmapCanvases[boundedTextureSize];
    if (!mipmap) {
        console.error("No mipmap found for size", boundedTextureSize);
        return;
    }

    const texturesPerRow = mipmap.width / scale; // Number of tiles per row in mipmap

    // Get element position in mipmap
    const srcX = (index % texturesPerRow) * textureSize;
    const srcY = Math.floor(index / texturesPerRow) * textureSize;

    // Get the sub-tile location within that tile
    const tileSize = ZOOM_0_CELLS_PER_MAP_UNIT;
    const tileIndexX = offsetCoords.x % CELLS_PER_NATURAL_TEXTURE_TILE;
    const tileIndexY = offsetCoords.y % CELLS_PER_NATURAL_TEXTURE_TILE;
    const subTileX = srcX + tileIndexX * scale;
    const subTileY = srcY + tileIndexY * scale; // (CELLS_PER_TILE - 1 - tileIndexY) * scale; // Flip y

    // Copy sub-tile to canvas
    canvasCtx.drawImage(mipmap, subTileX, subTileY, scale, scale, 0, 0, scale, scale);
    // console.log("drawTiles", offsetCoords, elementID, index, srcX, srcY, tileIndexX, tileIndexY, scale, scale);
}


// Helper: load an <img> from a URL and await it
const imageCache = new Map();

// TODO: remove this function
async function preloadTiles() {
  // Cache images from elementIndiciesWithImages
  for (const elementId of elementIndiciesWithImages) {
    for (let x = 0; x < CELLS_PER_NATURAL_TEXTURE_TILE; x++) {
      for (let y = 0; y < CELLS_PER_NATURAL_TEXTURE_TILE; y++) {
        for (let z = 0; z < get_zoom_from_map_units_per_cell(40); z++) {
          const url = getOffsetTileUrl({ x, y, z: 0 }, elementId);
          loadImage(url);
        } 
      }
    }
  }
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        if (imageCache.has(url)) {
          //console.log("cache hit");
            return resolve(imageCache.get(url)); // TODO: don't duplicate image cache
        }
        //console.log("cache miss");

        const img = new Image();
        img.onload = () => {
            if (img.width < 40) {
                imageCache.set(url, img); // Cache the image if width < 40px
            }
            resolve(img);
        };
        img.onerror = reject;
        img.src = url;
    });
}

// TODO: typescript define classes for map units, zoom 0 map tiles (256 map units), cells, display pixels, natural texture tiles, natural texture pixels
const ZOOM_0_CELLS_PER_MAP_UNIT = 8; // Base tile size for the map - this is purposefully not 1 to make sure code accounts for this!!
const METERS_PER_CELL = 1;
const MAP_UNITS_PER_ZOOM_0_MAP_TILE = 256; // Leaflet default
const ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE = ZOOM_0_CELLS_PER_MAP_UNIT * MAP_UNITS_PER_ZOOM_0_MAP_TILE; // Make sure dimensional analysis checks out!!
const CELLS_PER_NATURAL_TEXTURE_TILE = 8; // Number of cells per texture tile, lengthwise
const MAX_LOSSLESS_MAP_UNITS_PER_CELL = 128; // Maximum size per cell
const MAX_LOSSLESS_ZOOM = get_zoom_from_map_units_per_cell(MAX_LOSSLESS_MAP_UNITS_PER_CELL); // Maximum zoom level for lossless tiles

// Function to get tile URL using preloaded image data
function getTileUrl(coords) {
    // Adjust x/y to match tile indexing
    const x = coords.x;
    const y = coords.y;
    const zoom = coords.z;
    const absolute_x = x;
    const absolute_y = y;
    const size = get_map_units_per_cell_from_zoom(zoom);

    const pixelValue = getPixelValue(absolute_x, absolute_y);
    if (pixelValue === null) return null;

    if (elementIndiciesWithImages.includes(pixelValue)) {
        return `/tiles_cut/${Math.min(size, MAX_LOSSLESS_MAP_UNITS_PER_CELL)}/${pixelValue}/${absolute_x%CELLS_PER_NATURAL_TEXTURE_TILE}-${CELLS_PER_NATURAL_TEXTURE_TILE-1-(absolute_y)%CELLS_PER_NATURAL_TEXTURE_TILE}.png`; // TODO: y-coordinate up or down?
    }
    const colorHex = getColorHexById(pixelValue);
    return `/hex_colors_32/${colorHex}.png`;
}

function get_map_units_per_cell_from_zoom(zoom) {
  return 2 ** zoom;
}

function get_cells_per_zoom_0_map_tile_from_zoom(zoom) {
  return ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE / get_map_units_per_cell_from_zoom(zoom);
}

function get_bounded_zoom(zoom) {
  return Math.min(MAX_LOSSLESS_ZOOM, zoom);
}

function get_zoom_from_map_units_per_cell(size) {
  return Math.log2(size);
}

function getOffsetTileUrl(coords, elementId) {
    // Adjust x/y to match tile indexing
    const x = coords.x;
    const y = coords.y;
    const zoom = coords.z;
    const absolute_x = x;
    const absolute_y = y;
    const size = get_map_units_per_cell_from_zoom(zoom);

    if (elementIndiciesWithImages.includes(elementId)) {
        return `/tiles_cut/${Math.min(size, MAX_LOSSLESS_MAP_UNITS_PER_CELL)}/${elementId}/${absolute_x%CELLS_PER_NATURAL_TEXTURE_TILE}-${CELLS_PER_NATURAL_TEXTURE_TILE-1-(absolute_y)%CELLS_PER_NATURAL_TEXTURE_TILE}.png`; // TODO: y-coordinate up or down?
    }
    const colorHex = getColorHexById(elementId);
    return `/hex_colors_32/${colorHex}.png`;
}

const map = ref(null);
const webGLCanvas = ref(null); // Store single WebGL2Proxy instance
let webGLInitPromise = null;
const numCellsWorldWidth = ref(null);
const numCellsWorldHeight = ref(null);

const initializeWebGL = () => {
  if (webGLInitPromise) {
    // Initialization is already happening or finished, reuse it
    return webGLInitPromise;
  }

  webGLInitPromise = new Promise(async (resolve) => {
    if (!webGLCanvas.value) {
      {
        console.log("Initializing canvas manager");
        webGLCanvas.value = new WebGL2Proxy();
        const canvas_manager = webGLCanvas.value;

        console.log("Setting up canvas manager");

        console.log("  Loading images");

        const NATURAL_TILES_TEXTURE_SIZE = 1024;

        let image_urls = [
          "/elementIdx8.png",
          "/temperature32.png",
          "/mass32.png",
          "/element_data_1x1.png",
          "/space_00.png",
          "/space_01.png"
        ];

        for (let tileSize = NATURAL_TILES_TEXTURE_SIZE; tileSize >= 1; tileSize /= 2) {
          image_urls.push(`/tiles_mipmaps/${tileSize}x${tileSize}.png`);
        }

        const images = await loadImagesAsync(image_urls);

        console.log("  Bitmapping images");

        const imageBitmaps = await Promise.all(images.map(img => createImageBitmap(img)));

        console.log("  Inserting images to canvas manager");

        numCellsWorldWidth.value = images[0].width;
        numCellsWorldHeight.value = images[0].height;

        const numMapUnitsWorldWidth = numCellsWorldWidth.value / ZOOM_0_CELLS_PER_MAP_UNIT;
        const numMapUnitsWorldHeight = numCellsWorldHeight.value / ZOOM_0_CELLS_PER_MAP_UNIT;
        const NUM_WORLD_DISTANCES_BEYOND_BOUNDS = 2;
        const bounds =
            [[(-NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldWidth, (-NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldHeight],
              [(1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldWidth, (1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldHeight]];
        map.value.setMaxBounds(bounds); // TODO: change?

        const worldCenterX = numCellsWorldWidth.value / 2 / ZOOM_0_CELLS_PER_MAP_UNIT;
        const worldCenterY = -numCellsWorldHeight.value / 2 / ZOOM_0_CELLS_PER_MAP_UNIT;
        const worldCenterLatLong = [worldCenterY, worldCenterX];
        map.value.setView(worldCenterLatLong, 4)
        console.log(worldCenterLatLong, "worldCenterLatLong");

        await canvas_manager.setup(imageBitmaps);
        console.log("Created canvas manager!");
      }/*
      TODO: make sure
        const canvas_manager = canvasManager.value;

        // call loadImages with random values for width, height, x, y

        const scale = 10;
        const { width, height, x_offset, y_offset, canvas_width, canvas_height } =
            smallRender[id]
                ? {
                  width: 4,
                  height: 4,
                  x_offset: -128,
                  y_offset: -128,
                  canvas_width: 512,
                  canvas_height: 512,
                }
                : {
                  width: getRandomInt(636 / scale, 636 * 2 / scale),
                  height: getRandomInt(404 / scale, 404 * 2 / scale),
                  x_offset: getRandomInt(20, 30),
                  y_offset: getRandomInt(20, 30),
                  canvas_width: 636 * 2,
                  canvas_height: 404 * 2,
                };

        canvas_manager.render(numCellsWorldWidth.value, numCellsWorldHeight.value, width, height, x_offset, y_offset, canvas_width, canvas_height, () => {console.log("render finished");});
      }
      */
      resolve(); // ✅ Ensure the promise resolves after setup
    } else {
      resolve(); // If already initialized, resolve immediately
    }
  });

  return webGLInitPromise;
};

const drawDebugInfo = (ctx, coords, width, height) => {
  // 🟥 Draw white outline for the border
  ctx.strokeStyle = "white";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, width, height);

  // 🟥 Draw red border over the white outline
  ctx.strokeStyle = "red";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, width, height);

  // 🖍️ Set up font properties
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 🏳️ White outline for tile coordinates text
  ctx.lineWidth = 4;
  ctx.strokeStyle = "white";
  ctx.strokeText(`(${coords.x}, ${coords.y}, ${coords.z})`, width / 2, height / 2 - 10);

  // 🟥 Red text for tile coordinates
  ctx.fillStyle = "red";
  ctx.fillText(`(${coords.x}, ${coords.y}, ${coords.z})`, width / 2, height / 2 - 10);

  // 🏳️ White outline for tile size text (placed slightly below the coordinates)
  ctx.strokeStyle = "white";
  ctx.strokeText(`${width} × ${height} px`, width / 2, height / 2 + 10);

  // 🟥 Red text for tile size
  ctx.fillStyle = "red";
  ctx.fillText(`${width} × ${height} px`, width / 2, height / 2 + 10);
};

/*
TODO TS version, copy elsewhere
const canvasToBase64 = async (canvas: OffscreenCanvas | HTMLCanvasElement): Promise<string> => {
  let blob: Blob;

  if ('convertToBlob' in canvas) {
    // OffscreenCanvas path
    blob = await (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
  } else if ('toBlob' in canvas) {
    // HTMLCanvasElement path
    blob = await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to convert canvas to blob"));
      }, "image/png");
    });
  } else {
    throw new Error("Unsupported canvas type");
  }

  // Read the blob as a base64 string
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

 */
const canvasToBase64 = async (canvas) => {
  let blob;

  if ('convertToBlob' in canvas) {
    // OffscreenCanvas path
    blob = await canvas.convertToBlob({ type: "image/png" });
  } else if ('toBlob' in canvas) {
    // HTMLCanvasElement path
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to convert canvas to blob"));
      }, "image/png");
    });
  } else {
    throw new Error("Unsupported canvas type");
  }

  // Read the blob as a base64 string
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// TODO: TS version, async/sync
const imageToBase64 = (img, type = "image/png") => {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  ctx.drawImage(img, 0, 0);

  return canvas.toDataURL(type);
}

const initializeMap = () => {
  if (!map.value) {
    const MapsNotIncludedCRS = L.extend({}, L.CRS.Simple, {
      distance: function (latlng1, latlng2) {
        const dx = latlng2.lng - latlng1.lng;
        const dy = latlng2.lat - latlng1.lat;
        const mapUnitsDistance = Math.sqrt(dx * dx + dy * dy);

        const METERS_PER_MAP_UNIT = ZOOM_0_CELLS_PER_MAP_UNIT * METERS_PER_CELL;

        return mapUnitsDistance * METERS_PER_MAP_UNIT;
      }
    });

    map.value = L.map("map", {
      crs: MapsNotIncludedCRS,
    }).setView([0,0], 4);

    L.TileLayer.PlaceholderLayer = L.TileLayer.extend({
      getTileUrl: function(coords) {
        return '/mode_nominal_256.png';
      },
      getAttribution: function() {
        return "Klei Entertainment, Maps Not Included"
      }
    });

    L.tileLayer.placeholderLayer = function (opts) {
      return new L.TileLayer.PlaceholderLayer(opts);
    };

    L.tileLayer.placeholderLayer().addTo(map.value);


    L.GridLayer.MyCanvasLayer = L.GridLayer.extend({
      createTile: function (coords, done) {
        // if (!webGLCanvas.value) {
        //   console.error("WebGL2Proxy is not initialized");
        //   return;
        // }

        const tile = document.createElement("canvas");
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        //var ctx = tile.getContext("2d");

        // ✅ Wait for WebGL setup before rendering
        initializeWebGL().then(async () => {

          const canvas_size = get_map_units_per_cell_from_zoom(coords.z);
          const xy_scale = get_cells_per_zoom_0_map_tile_from_zoom(coords.z);
          const x_offset = -1 * coords.x * xy_scale;
          const y_offset = (coords.y + 1) * xy_scale - numCellsWorldHeight.value;

          console.log("xyz", coords, canvas_size, xy_scale, x_offset, y_offset);

          console.log("begin render");
          const [_, bitmap] = await webGLCanvas.value
              .sequence()
              .render(
                numCellsWorldWidth.value,
                numCellsWorldHeight.value,
                xy_scale, xy_scale,
                x_offset, y_offset,
                size.x, size.y
              ).transferImageBitmap()
              .exec();
          console.log("finish render");
          console.log(bitmap);

          try {

            const debugOutlines = true;
            const debugUrlPrint = false;

            if (debugOutlines) {
              const tile_2d_ctx = tile.getContext('2d');
              tile_2d_ctx.drawImage(bitmap, 0, 0);
              drawDebugInfo(tile_2d_ctx, coords, size.x, size.y);
            } else {
              const tile_bmp_ctx = tile.getContext('bitmaprenderer');
              tile_bmp_ctx.transferFromImageBitmap(bitmap);
            }

            if (debugUrlPrint) {
              canvasToBase64(tile).then((base64) => {
                console.log(`Tile (${coords.x},${coords.y},${coords.z}) base64:`, base64);
              });
            }

            //tileWrapper.replaceChild(tile, placeholder);
            //done(null, tileWrapper);
            done(null, tile);
          } catch (err) {
            console.error(`Failed to get canvas image bitmap`, err);
            throw err;
          }
        });

        return tile;
      },
      getAttribution: function() {
        return "Klei Entertainment, Maps Not Included"
      },
    });

    L.gridLayer.myCanvasLayer = function (opts) {
      return new L.GridLayer.MyCanvasLayer(opts);
    };

    L.gridLayer.myCanvasLayer().addTo(map.value);
    L.control.scale().addTo(map.value);
  }
}

let colorMap = {}; // Store preloaded ID-to-HEX mappings
let uiColorMap = {}; // Store preloaded ID-to-HEX mappings

// Preload JSON data and build ID-to-color map
async function loadColorData() {
    const response = await fetch('/elements.json');
    const elements = await response.json();

    // Store precomputed color HEX values for each ID
    elements.forEach(element => {
        const rgbToHex = (r, g, b) => 
            `${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
        
        colorMap[element.idx] = rgbToHex(element.colorR, element.colorG, element.colorB);
        uiColorMap[element.idx] = rgbToHex(element.uiR, element.uiG, element.uiB);
    });

    console.log("Color data loaded successfully!");
}

let elementIndiciesWithImages = []; // Store preloaded ID-to-HEX mappings

// Preload JSON data and build ID-to-color map
async function loadValidElementIdxImages() {
    const response = await fetch('/tiles/valid_idxs.json');
    const elements = await response.json();

    elementIndiciesWithImages = elements;

    console.log("Element idx image data loaded successfully!");
}

// Synchronous function to get color HEX from preloaded map
function getColorHexById(idx) {
    return uiColorMap[idx] || "000000"; // Default to black if ID not found TODO: change from material overlay to looking more like in-game
}

async function lowPriorityTasks() {
    const timeStart = performance.now();
    console.log("lowPriorityTasks start");
    // await preloadTiles();
    const timeEnd = performance.now();
    const executionTime = timeEnd - timeStart;
    console.log("lowPriorityTasks end:", executionTime, "ms");
}

// Initialize color data before map starts
async function initializeApp() {
    // await loadColorData(); // Preload color mappings
    // await loadValidElementIdxImages(); // Preload valid element idx images
    // await loadImageData(); // Ensure image data is loaded first
    // await preloadMipmaps(); // Preload mipmaps
    // await initializeWebGL();
    await initializeMap(); // Then initialize the map
    const testZoom = 5;
    const startTime = performance.now();
    lowPriorityTasks();
}



const route = useRoute();

const MAPEXPLORER_URL = import.meta.env.VITE_MAPEXPLORER_URL || 'http://localhost:8080/'; // https://stefan-oltmann.de/oni-seed-browser';

const iframeUrl = ref(null)
const iframeRef = ref(null)
const queryParams = ref({});

onMounted(() => {

  queryParams.value = { ...route.query, embedded: 'mni' };

  // add token to query params if it exists
  const token = useUserStore().token;
  if (token) {
    queryParams.value.token = token;
  }

  // Construct iframe url from query param  
  let url = MAPEXPLORER_URL;

  url = `${url}?${new URLSearchParams(queryParams.value).toString()}`;
  
  if (route.params.seed) {
    url = `${url}#${route.params.seed}`;
  }
  
  iframeUrl.value = url;

  // Start the application
  initializeApp();
  
})
</script>

<style scoped>
main {
  overflow: hidden;
  height: 100vh; 
}

.iframe-container {
  display: flex;
  width: 100%; 
  height: calc(100vh - 69px); /* not ideal, but I can't seem to work out how to get the frame to take the remaining space and ignore the navbar*/
  overflow: hidden; 
}

iframe {
  width: 100%; 
  height: 100%;
  border: none;
  overflow: auto;
}
</style>
