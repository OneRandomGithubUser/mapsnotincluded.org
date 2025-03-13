<template>
  <div class="iframe-container">
    <iframe ref="iframeRef" :src="iframeUrl" frameborder="0" allow="clipboard-read; clipboard-write"></iframe>
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

/*
async function getColorHexById(idx) {
    const response = await fetch('/elements.json');
    const elements = await response.json();

    const element = elements[idx];
    if (!element) {
        console.error("ID not found:", idx);
        return null;
    }

    // Convert RGB to HEX
    const rgbToHex = (r, g, b) => 
        `${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;

    return rgbToHex(element.colorR, element.colorG, element.colorB);
}


for (let i = 0; i < 118; i++) {
    getColorHexById(i).then(color => {
        if (color) {
            console.log(color);
        }
    });
}

async function getImageDataArray() {
    const imageUrl = '/elementIdx8.png';

    try {
        // Fetch the image as a Blob
        const response = await fetch(imageUrl);
        const blob = await response.blob();

        // Create an ImageBitmap from the Blob
        const imageBitmap = await createImageBitmap(blob);

        // Create a canvas to extract pixel data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas size to image size
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;

        // Draw the image on the canvas
        ctx.drawImage(imageBitmap, 0, 0);

        // Get image data (RGBA array)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        // console.log("imageData load: ", imageData.length);
        // console.log(canvas.width, canvas.height, imageData);

        // Convert to a standard array (optional)
        return (Array.from(imageData));

    } catch (error) {
        console.error("Error loading image:", error);
        return null;
    }
}

// Example usage
getImageDataArray().then(data => console.log(data)); 


async function getPixelValue(x, y) {
    const imageData = await getImageDataArray();
    if (!imageData) return null;

    const imageWidth = imageData[0];
    const imageHeight = imageData[1];
    const imageArray = imageData[2];
    const index = (y * imageWidth + x) * 4; // RGBA array, 4 values per pixel

    // console.log("imageData: ", imageData[index]);
    return imageData[index]; // Take Red channel (Greyscale Image)
}

async function getTileUrl(coords) {
    // Adjust x/y so they match the tile system
    const x = coords.x + 1;
    const y = coords.y + 1;

    // Assuming the tile coordinates map directly to image pixels
    const pixelValue = await getPixelValue(x, y);
    if (pixelValue === null) return null;

    // Convert grayscale value to HEX color
    const colorHex = await getColorHexById(pixelValue);

    // Return the preview URL
    //const url = `https://preview.colorkit.co/color/${colorHex}.png`;
    const url = `https://tile.openstreetmap.org/${coords.z}/${x}/${y}.png`;
    return url;
}
*/

const initialMap = ref(null);
/*

let imageDataCache = null; // Global variable to store preloaded image data

async function preloadImageData() {
    const imageUrl = 'public/elementIdx8.png';

    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;

        ctx.drawImage(imageBitmap, 0, 0);

        // Store the image data globally for synchronous access
        imageDataCache = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (error) {
        console.error("Error loading image:", error);
    }
}

function getPixelValue(x, y) {
    if (!imageDataCache) {
      console.log("not loaded!");
      return 0; // Return default value if not loaded
    }

    const width = imageDataCache.width;
    const index = (y * width + x) * 4; // Get Red channel (Greyscale Image)
    
    return imageDataCache.data[index];
}

function getTileUrl(coords) {
    const x = coords.x + 1;
    const y = coords.y + 1;

    // Synchronously get pixel value from cached image data
    const pixelValue = getPixelValue(x, y);
    
    // Convert pixel intensity to HEX color
    const colorHex = pixelValue.toString(16).padStart(2, '0').toUpperCase().repeat(3); // Converts grayscale to HEX format

    return `https://preview.colorkit.co/color/${colorHex}.png`;
}

async function initMap() {
  initialMap.value = L.map('map').setView([23.8041, 90.4152], 6);
    //L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    //    maxZoom: 19, 
    //    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    //}).addTo(initialMap.value);

    L.TileLayer.MyCustomLayer = L.TileLayer.extend({
    getTileUrl: function(coords) {
        console.log(coords);
        const x = coords.x;
        const y = coords.y;

        const url = getTileUrl(coords);
        console.log(url);
        return url;`https://tile.openstreetmap.org/${coords.z}/${x}/${y}.png`;

        // return L.TileLayer.prototype.getTileUrl.call(this, coords);
    }
  });

  // static factory as recommended by http://leafletjs.com/reference-1.0.3.html#class
  L.tileLayer.myCustomLayer = function(templateUrl, options) {
      return new L.TileLayer.MyCustomLayer(templateUrl, options);
  }

  // create the layer and add it to the map
  L.tileLayer.myCustomLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      //minZoom: 10,
      //maxZoom: 12,
      crs: L.CRS.Simple,
      tms: false,
      continuousWorld: 'false',
      noWrap: false,
      defaultRadius:1,
  }).addTo(initialMap.value);
}
  */

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

/*

// Function to fetch an image given a URL
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// Function to create a larger tile from smaller ones
async function generateLargeTile(coords) {
    const x = coords.x;
    const y = coords.y;
    const zoom = coords.z;
    const outputSize = BASE_SIZE; // Output size is always BASE_SIZE, ex 128x128
    const tileSize = BASE_SIZE / (2 ** (BASE_ZOOM - zoom)); // Individual tile size at current zoom, ex 32x32
    const fetchTileSize = tileSize * 2; // Twice the tile size for overlapping, ex 64x64
    const gridSize = outputSize / tileSize; // We want a gridSize x gridSize grid of final tileSize x tileSize cells, ex 4x4 of 32x32
    const fetchGridSize = gridSize + 1; // Fetch one more row and column grid for overlap handling

    const offsetX = x * tileSize - (fetchTileSize / 2);
    const offsetY = y * tileSize - (fetchTileSize / 2);
    const fetchZoom = zoom + 1; // Zoom level at which we fetch images

    // Create an offscreen canvas
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = outputSize;
    offscreenCanvas.height = outputSize;
    const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

    // Load tiles
    const tilePromises = [];
    for (let i = 0; i < fetchGridSize; i++) {
        for (let j = 0; j < fetchGridSize; j++) {
            // get the x and y coordinate of the tile that would be of size tileSize (and get a larger fetchTileSize to account for overlap)
            const tileX = Math.floor(offsetX / tileSize) + i;
            const tileY = Math.floor(offsetY / tileSize) + j;
            const fetchCoords = { x: tileX, y: tileY, z: fetchZoom };
            const url = getTileUrl(fetchCoords);
            console.log("loadImage: ", url, " at ", fetchCoords);
            tilePromises.push(loadImage(url));
        }
    }

    const images = await Promise.all(tilePromises);

    // Draw tiles onto the canvas in a 5x5 grid
    let imgIndex = 0;
    for (let i = 0; i < fetchGridSize; i++) {
        for (let j = 0; j < fetchGridSize; j++) {
            const img = images[imgIndex++];
            ctx.drawImage(img, j * fetchTileSize, i * fetchTileSize, fetchTileSize, fetchTileSize);
        }
    }

    // Now process the 4x4 overlapping grid using 1/4 of each of the 4 tiles
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const sx = (j + 1) * fetchTileSize - fetchTileSize / 2;
            const sy = (i + 1) * fetchTileSize - fetchTileSize / 2;
            const sw = fetchTileSize / 2;
            const sh = fetchTileSize / 2;

            const dx = j * tileSize;
            const dy = i * tileSize;
            const dw = tileSize;
            const dh = tileSize;

            // Extract the four quadrants from the neighboring tiles
            const topLeft = ctx.getImageData(sx - sw, sy - sh, sw, sh);
            const topRight = ctx.getImageData(sx, sy - sh, sw, sh);
            const bottomLeft = ctx.getImageData(sx - sw, sy, sw, sh);
            const bottomRight = ctx.getImageData(sx, sy, sw, sh);

            // Clear the destination area
            ctx.clearRect(dx, dy, dw, dh);

            // Draw the quadrants onto the final tile
            ctx.putImageData(topLeft, dx, dy);
            ctx.putImageData(topRight, dx + dw / 2, dy);
            ctx.putImageData(bottomLeft, dx, dy + dh / 2);
            ctx.putImageData(bottomRight, dx + dw / 2, dy + dh / 2);
        }
    }

    return offscreenCanvas;
}
*/

function getAlphaMask(bitmask, boundarySize, maskCanvas) {
  // TODO: preload
    // Create a small offscreen canvas for the alpha mask
    const maskCtx = maskCanvas.getContext('2d');

    // paint the entire mask white
    maskCtx.fillStyle = 'white';
    maskCtx.fillRect(0, 0, boundarySize, boundarySize);

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

    // Decide how many squares in each dimension. 
    // For example, if BASE_ZOOM=7 and z=3, scale=2^(7-3)=16 => 16 squares horizontally.

    //console.log("createZoomedTile", x, y, z, BASE_SIZE, BASE_ZOOM);
    const scale = get_size_from_zoom(z);  // size of each tile's edge in pixels
    const gridSize = 2 ** (BASE_ZOOM - z) + 1;  // number of real tiles in each edge e.g., 17
    const boundarySize = 2 ** (BASE_ZOOM - z); // Each boundary square is 16×16 (adjust if needed)
    //console.log("scale", scale, "gridSize", gridSize, "boundarySize", boundarySize);

    // The final offscreen canvas:

    const timeCheckpoint0a = DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performance.now();
    DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performanceMetrics += ["checkpoint 0a", timeCheckpoint0a - timeStart].join(" ") + "\n";
    const offCanvas = document.createElement('canvas');
  const timeCheckpoint0b = DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performance.now();
  DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performanceMetrics += ["checkpoint 0b", timeCheckpoint0b - timeCheckpoint0a].join(" ") + "\n";
    offCanvas.width = boundarySize * scale;
    offCanvas.height = boundarySize * scale;
    //console.log("offCanvas.width, offCanvas.height", offCanvas.width, offCanvas.height);
    const offCtx = offCanvas.getContext('2d');

    // Clear it first
    offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);

    // "Corner" sampling:
    // top-left corner in world coordinates:
    const startWorldX = x * boundarySize; 
    const startWorldY = y * boundarySize; 
    // So we’ll read the 17×17 set of actual tile centers from
    // (startWorldX, startWorldY) to (startWorldX+gridSize, startWorldY+gridSize).

    //console.log("startWorldX, startWorldY", startWorldX, startWorldY);

    // For each boundary square [i,j], we need the 4 corners' element IDs:
    // corners: (i, j), (i+1, j), (i, j+1), (i+1, j+1).
  const timeCheckpoint1 = DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performance.now();
  
  const alphaMaskCanvas = document.createElement('canvas');
  alphaMaskCanvas.width = scale;
  alphaMaskCanvas.height = scale;
  const alphaMaskCtx = alphaMaskCanvas.getContext('2d');
  alphaMaskCtx.globalCompositeOperation = 'source-over';

  DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performanceMetrics += ["checkpoint 1", timeCheckpoint1 - timeCheckpoint0b].join(" ") + "\n";
    for (let j = 0; j < gridSize; j++) {
      const timeCheckpoint2 = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_1 ? null : performance.now();
        for (let i = 0; i < gridSize; i++) {
          const timeCheckpoint3 = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_2 ? null : performance.now();

            // The top-left corner in that 17×17 set:
            const topLeftID     = getPixelValue(startWorldX + i,   startWorldY + j);
            const topRightID    = getPixelValue(startWorldX + i+1, startWorldY + j);
            const bottomLeftID  = getPixelValue(startWorldX + i,   startWorldY + j+1);
            const bottomRightID = getPixelValue(startWorldX + i+1, startWorldY + j+1);

            if (topLeftID === null || topRightID === null || bottomLeftID === null || bottomRightID === null) {
                // console.log("skipping", i, j);
                continue;
            }

            // Now find the unique IDs among these four:
            // For each unique ID, figure out which bits apply 
            // (top-left=1, top-right=2, bottom-left=4, bottom-right=8)
            const cornerMap = new Map(); // Map elementID => bitmask
            function setCorner(id, bit) {
                if (!cornerMap.has(id)) {
                    cornerMap.set(id, 0);
                }
                cornerMap.set(id, cornerMap.get(id) | bit);
            }
            setCorner(topLeftID,     1);
            setCorner(topRightID,    2);
            setCorner(bottomLeftID,  4);
            setCorner(bottomRightID, 8);
            //console.log("i, j", i, j)

          const timeCheckpoint3a = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performance.now();
          DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performanceMetrics += ["      checkpoint 3a", timeCheckpoint3a - timeCheckpoint3].join(" ") + "\n";

            // For each unique ID, get the alpha mask and then draw the tile:
            for (const [elementID, bitmask] of cornerMap.entries()) {
              const timeCheckpoint3b = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performance.now();
                // 1) Build or reuse the alpha mask:
                getAlphaMask(bitmask, scale, alphaMaskCanvas);
                const timeCheckpoint3c = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performance.now();
                DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performanceMetrics += ["      checkpoint 3c", timeCheckpoint3c - timeCheckpoint3b].join(" ") + "\n";

                // 2) Load the tile image for the offset coords & that elementID
                //    The "offsetCoords" might just be your same (x, y, z), or 
                //    you might pass something different if you want sub-tiling, etc.
                const offsetCoords = { x: (startWorldX + i), y: (startWorldY + j), z };
                const tileUrl = getOffsetTileUrl(offsetCoords, elementID);
                //console.log("loadImage url at coord", tileUrl, "for element", elementID, offsetCoords, cornerMap);

                const timeCheckpoint3ca = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performance.now();
                DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performanceMetrics += ["      checkpoint 3ca", timeCheckpoint3ca - timeCheckpoint3c].join(" ") + "\n";

                // We'll load it via a temporary <img>:
                //let img = await loadImage(tileUrl); // TODO: remove

                const timeCheckpoint3d = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performance.now();
                DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performanceMetrics += ["      checkpoint 3d", timeCheckpoint3d - timeCheckpoint3ca].join(" ") + "\n";

                // 3) Combine the alpha mask and the tile image 
                //    by drawing the tile onto alphaMaskCanvas using "source-over",
                //    then we’ll draw alphaMaskCanvas onto offCanvas.
                
                
                // Clear the alphaMask first:

                //console.log(alphaMaskCanvas.toDataURL("image/png"));
                //alphaMaskCtx.clearRect(0, 0, scale, scale);
                //console.log(alphaMaskCanvas.toDataURL("image/png"));

                // Draw the tile:
                
                //tileCtx.drawImage(alphaMaskCanvas, 0, 0, scale, scale);
                //console.log("draw alpha", alphaMaskCanvas.toDataURL("image/png"));
                //alphaMaskCtx.globalCompositeOperation = 'source-in'; TODO
                drawTiles(alphaMaskCtx, offsetCoords, elementID);
                //alphaMaskCtx.drawImage(img, 0, 0, scale, scale);
                //alphaMaskCtx.globalCompositeOperation = 'source-over'; TODO
                const timeCheckpoint3e = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performance.now();
                DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performanceMetrics += ["      checkpoint 3e", timeCheckpoint3e - timeCheckpoint3d].join(" ") + "\n";
                //console.log("draw tile", alphaMaskCanvas.toDataURL("image/png"));

                // alphaMaskCanvas is now the tile image, 
                // but we actually want the mask to cut out corners.
                // The easiest way: set alphaMaskCtx.globalCompositeOperation = 'destination-in'
                // and redraw the alpha shape on top.

                //console.log(alphaMaskCanvas.toDataURL("image/png"));

                // Redraw the same alpha mask we already put in alphaMaskCanvas,
                // or just put the mask again:
                // (But we already have the alpha in the mask’s pixels, 
                // so we can skip re-drawing if we built the mask that way from scratch.)
                // If you need to re-draw, you could do:
                // alphaMaskCtx.drawImage(originalMask, 0, 0); 
                // but since getAlphaMask(...) directly returned alpha in the entire region, 
                // we could also first draw the tile onto a blank canvas, 
                // then compose with alpha. Approaches vary.

                // Finally, draw alphaMaskCanvas into the final offscreen at the correct offset:
                const drawX = i * scale;
                const drawY = j * scale;
                offCtx.drawImage(alphaMaskCanvas, drawX, drawY);
                //console.log("one draw", offCanvas.toDataURL("image/png"));
                //console.log("drawX, drawY", drawX, drawY, scale, scale);
                const timeCheckpoint3f = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performance.now();
                DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_3 ? null : performanceMetrics += ["      checkpoint 3f", timeCheckpoint3f - timeCheckpoint3e].join(" ") + "\n";
            }
            //console.log("cell draw", offCanvas.toDataURL("image/png"));
            const timeCheckpoint4 = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_2 ? null : performance.now();
            DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_2 ? null : performanceMetrics += ["    checkpoint 4", timeCheckpoint4 - timeCheckpoint3].join(" ") + "\n";
        }
        const timeCheckpoint5 = DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_1 ? null : performance.now();
        DISABLE_MEASURE_ZOOMED_TILE_TIME_LEVEL_1 ? null : performanceMetrics += ["  checkpoint 5", timeCheckpoint5 - timeCheckpoint2, "iterations:", gridSize].join(" ") + "\n";
    }

    const timeEnd = DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performance.now();
    DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performanceMetrics += ["end createZoomedTile", timeEnd - timeCheckpoint1, "iterations:", gridSize * gridSize].join(" ") + "\n";
    DISABLE_MEASURE_ZOOMED_TILE_TIME ? null : performanceMetrics += ["total createZoomedTile", timeEnd - timeStart].join(" ") + "\n";
    if (!DISABLE_MEASURE_ZOOMED_TILE_TIME) {
      console.log(performanceMetrics);
    }

    // Return the completed canvas
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
    const scale = get_size_from_zoom(boundedZoom);

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
    const textureSize = scale * CELLS_PER_TILE;
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
    const tileSize = BASE_SIZE;
    const tileIndexX = offsetCoords.x % CELLS_PER_TILE;
    const tileIndexY = offsetCoords.y % CELLS_PER_TILE;
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
    for (let x = 0; x < CELLS_PER_TILE; x++) {
      for (let y = 0; y < CELLS_PER_TILE; y++) {
        for (let z = 0; z < get_zoom_from_size(40); z++) {
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

const BASE_ZOOM = 10; // Base zoom level for the map
const BASE_SIZE = 512; // Base tile size for the map
const CELLS_PER_TILE = 8; // Number of cells per texture tile, lengthwise
const MAX_SIZE_PER_CELL = 128; // Maximum size per cell
const MAX_LOSSLESS_ZOOM = get_zoom_from_size(MAX_SIZE_PER_CELL); // Maximum zoom level for lossless tiles

// Function to get tile URL using preloaded image data
function getTileUrl(coords) {
    // Adjust x/y to match tile indexing
    const x = coords.x;
    const y = coords.y;
    const zoom = coords.z;
    //const absolute_x = zoom > BASE_ZOOM ? Math.floor(x/(2**(zoom-BASE_ZOOM))) : Math.floor(x/(2**(0)));
    //const absolute_y = zoom > BASE_ZOOM ? Math.floor(y/(2**(zoom-BASE_ZOOM))) : Math.floor(y/(2**(0)));
    // const size = zoom > BASE_ZOOM ? BASE_SIZE : BASE_SIZE * (2**(zoom-BASE_ZOOM));
    const absolute_x = x;
    const absolute_y = y;
    const size = get_size_from_zoom(zoom);
    //console.log("coords", absolute_x, absolute_y, "size", size, "raw", coords);

    const pixelValue = getPixelValue(absolute_x, absolute_y);
    if (pixelValue === null) return null;

    //console.log("elementIndiciesWithImages", elementIndiciesWithImages);
    if (elementIndiciesWithImages.includes(pixelValue)) {
        return `/tiles_cut/${Math.min(size, MAX_SIZE_PER_CELL)}/${pixelValue}/${absolute_x%CELLS_PER_TILE}-${CELLS_PER_TILE-1-(absolute_y)%CELLS_PER_TILE}.png`; // TODO: y-coordinate up or down?
    }
    const colorHex = getColorHexById(pixelValue);
    return `/hex_colors_32/${colorHex}.png`;
}

function get_size_from_zoom(zoom) {
  return BASE_SIZE * (2**(zoom-BASE_ZOOM));
}

function get_bounded_zoom(zoom) {
  return Math.min(MAX_LOSSLESS_ZOOM, zoom);
}

function get_zoom_from_size(size) {
  return Math.log2(size / BASE_SIZE) + BASE_ZOOM;
}

function getOffsetTileUrl(coords, elementId) {
    // Adjust x/y to match tile indexing
    const x = coords.x;
    const y = coords.y;
    const zoom = coords.z;
    //const absolute_x = zoom > BASE_ZOOM ? Math.floor(x/(2**(zoom-BASE_ZOOM))) : Math.floor(x/(2**(0)));
    //const absolute_y = zoom > BASE_ZOOM ? Math.floor(y/(2**(zoom-BASE_ZOOM))) : Math.floor(y/(2**(0)));
    // const size = zoom > BASE_ZOOM ? BASE_SIZE : BASE_SIZE * (2**(zoom-BASE_ZOOM));
    const absolute_x = x;
    const absolute_y = y;
    const size = get_size_from_zoom(zoom);
    //console.log("coords", absolute_x, absolute_y, "size", size, "raw", coords);

    //console.log("elementIndiciesWithImages", elementIndiciesWithImages);
    if (elementIndiciesWithImages.includes(elementId)) {
        return `/tiles_cut/${Math.min(size, MAX_SIZE_PER_CELL)}/${elementId}/${absolute_x%CELLS_PER_TILE}-${CELLS_PER_TILE-1-(absolute_y)%CELLS_PER_TILE}.png`; // TODO: y-coordinate up or down?
    }
    const colorHex = getColorHexById(elementId);
    return `/hex_colors_32/${colorHex}.png`;
}

// Initialize map after image data is loaded
async function initializeMap() {

  initialMap.value = L.map('map').setView([0, 0], BASE_ZOOM);

L.GridLayer.MyCanvasLayer = L.GridLayer.extend({
    createTile: function (coords, done) {
        var tile = document.createElement('canvas');
        var size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        var ctx = tile.getContext('2d');

        if (coords.z < BASE_ZOOM) {
            this.options.tileSize = BASE_SIZE;
            console.log("a - creating zoomed tile");
            createZoomedTile(coords, BASE_SIZE, BASE_ZOOM).then(canvas => {
                ctx.drawImage(canvas, 0, 0, size.x, size.y);
                done(null, tile);
            }).catch(err => {
                console.error("Error creating zoomed tile:", err);
                done(err, tile);
            });
        } else {
            this.options.tileSize = BASE_SIZE * (2**(coords.z - BASE_ZOOM));
            console.log("b - fetching tile");
            var img = new Image();
            img.crossOrigin = "Anonymous"; // Avoid CORS issues if necessary
            img.onload = function () {
                ctx.drawImage(img, 0, 0, size.x, size.y);
                done(null, tile);
            };
            img.onerror = function (err) {
                console.error("Tile load error", err);
                done(err, tile);
            };
            img.src = getTileUrl(coords);
        }

        return tile;
    }
});

// Static factory function
L.gridLayer.myCanvasLayer = function (options) {
    return new L.GridLayer.MyCanvasLayer(options);
};

// Add the custom canvas layer to the map
L.gridLayer.myCanvasLayer({
    minZoom: 0,
    maxZoom: MAX_LOSSLESS_ZOOM,
    tileSize: BASE_SIZE,
    continuousWorld: false,
    noWrap: true,
    crs: L.CRS.Simple,
    worldCopyJump: false
}).addTo(initialMap.value);

let bounds = [[0, 0], [imageWidth, imageHeight]];
//initialMap.value.setMaxBounds(bounds); // TODO: change?

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
    await loadColorData(); // Preload color mappings
    await loadValidElementIdxImages(); // Preload valid element idx images
    await loadImageData(); // Ensure image data is loaded first
    await preloadMipmaps(); // Preload mipmaps
    await initializeMap(); // Then initialize the map
    const testZoom = 5;
    const startTime = performance.now();
    console.log(createZoomedTile({x : Math.floor(330*2**(testZoom-BASE_ZOOM)), y : Math.floor(300*2**(testZoom-BASE_ZOOM)), z : testZoom}, BASE_SIZE, BASE_ZOOM).then(canvas => {
      console.log("createZoomedTile");
      console.log(canvas);
                    let url = canvas.toDataURL("image/png");
                    console.log(url);
                  }));
                  const endTime = performance.now();
                  const executionTime = endTime - startTime;
                  console.log(`Execution time: ${executionTime} milliseconds`);
    lowPriorityTasks();
}

// Start the application
initializeApp();



const route = useRoute();

const MAPEXPLORER_URL = import.meta.env.VITE_MAPEXPLORER_URL || 'https://stefan-oltmann.de/oni-seed-browser';

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

  //initMap();
  

  /*
  initialMap.value = L.map('map').setView([23.8041, 90.4152], 6);
    //L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    //    maxZoom: 19, 
    //    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    //}).addTo(initialMap.value);

    L.TileLayer.MyCustomLayer = L.TileLayer.extend({
    getTileUrl: function(coords) {
        console.log(coords);
        const x = coords.x;
        const y = coords.y;

        return `https://tile.openstreetmap.org/${coords.z}/${y}/${x}.png`;

        // return L.TileLayer.prototype.getTileUrl.call(this, coords);
    }
  });

  // static factory as recommended by http://leafletjs.com/reference-1.0.3.html#class
  L.tileLayer.myCustomLayer = function(templateUrl, options) {
      return new L.TileLayer.MyCustomLayer(templateUrl, options);
  }

  // create the layer and add it to the map
  L.tileLayer.myCustomLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 0,
      maxZoom: 5,
      tms: false,
      continuousWorld: 'false',
      noWrap: false,
      defaultRadius:1,
  }).addTo(initialMap.value);
*/
  
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
