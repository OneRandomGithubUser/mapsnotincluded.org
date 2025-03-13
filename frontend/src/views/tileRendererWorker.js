

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
    // await initializeMap(); // Then initialize the map
    const testZoom = 5;
    const startTime = performance.now();
    lowPriorityTasks();
}

export { initializeApp, BASE_ZOOM, MAX_LOSSLESS_ZOOM, BASE_SIZE, imageWidth, imageHeight };
  
  self.onmessage = async function (e) {
    const { canvas, x, y, z, BASE_SIZE, BASE_ZOOM } = e.data;
    const scale = get_size_from_zoom(z);
    const gridSize = 2 ** (BASE_ZOOM - z) + 1;
    const boundarySize = 2 ** (BASE_ZOOM - z);
    
    const ctx = canvas.getContext("2d");

    // **1️⃣ Cache Alpha Masks (Avoid Redundant Calls)**
    const alphaMasks = new Map();
    
    function getCachedAlphaMask(bitmask) {
        if (!alphaMasks.has(bitmask)) {
            const maskCanvas = new OffscreenCanvas(scale, scale);
            const maskCtx = maskCanvas.getContext("2d");
            getAlphaMask(bitmask, scale, maskCanvas);
            alphaMasks.set(bitmask, maskCanvas);
        }
        return alphaMasks.get(bitmask);
    }

    // **2️⃣ Preload Tile Images in Parallel**
    const tilePromises = [];
    const tileCoords = [];

    for (let j = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
            const topLeftID     = getPixelValue(x * boundarySize + i, y * boundarySize + j);
            const topRightID    = getPixelValue(x * boundarySize + i+1, y * boundarySize + j);
            const bottomLeftID  = getPixelValue(x * boundarySize + i, y * boundarySize + j+1);
            const bottomRightID = getPixelValue(x * boundarySize + i+1, y * boundarySize + j+1);

            if (topLeftID === null || topRightID === null || bottomLeftID === null || bottomRightID === null) {
                continue;
            }

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
                const tileUrl = getOffsetTileUrl({ x: i, y: j, z }, elementID);
                tileCoords.push({ i, j, elementID, bitmask });

                tilePromises.push(
                    fetch(tileUrl)
                        .then(response => response.blob())
                        .then(blob => createImageBitmap(blob))
                );
            }
        }
    }

    const loadedTiles = await Promise.all(tilePromises); 

    // **3️⃣ Batch Draw Using Larger Tiles (Reduce Calls)**
    requestAnimationFrame(() => {
        tileCoords.forEach(({ i, j, elementID, bitmask }, index) => {
            const img = loadedTiles[index];

            // Use Cached Alpha Mask
            const alphaMaskCanvas = getCachedAlphaMask(bitmask);

            // Draw onto final canvas
            ctx.drawImage(alphaMaskCanvas, i * scale, j * scale);
            ctx.drawImage(img, i * scale, j * scale);
        });

        self.postMessage("done");
    });
};
