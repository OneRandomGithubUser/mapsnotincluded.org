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
        //console.log("Coordinates out of bounds:", x, y);
        return null; // Return null if out of bounds
    }

    const index = (y * width + x) * 4; // RGBA array, 4 values per pixel

    return imageData.data[index]; // Take Red channel (Greyscale Image)
}

const BASE_ZOOM = 7; // Base zoom level for the map
const BASE_SIZE = 64; // Base tile size for the map
const TILES_PER_CELL = 8; // Number of tiles per cell
const MAX_SIZE_PER_CELL = 128; // Maximum size per cell
const MAX_LOSSLESS_ZOOM = Math.floor(Math.log(MAX_SIZE_PER_CELL / BASE_SIZE) / Math.log(2)) + BASE_ZOOM; // Maximum zoom level for lossless tiles

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
    const size = BASE_SIZE * (2**(zoom-BASE_ZOOM));
    //console.log("coords", absolute_x, absolute_y, "size", size, "raw", coords);

    const pixelValue = getPixelValue(absolute_x, absolute_y);
    if (pixelValue === null) return null;

    //console.log("elementIndiciesWithImages", elementIndiciesWithImages);
    if (elementIndiciesWithImages.includes(pixelValue)) {
        return `/tiles_cut/${Math.min(size, MAX_SIZE_PER_CELL)}/${pixelValue}/${absolute_x%TILES_PER_CELL}-${TILES_PER_CELL-1-(absolute_y)%TILES_PER_CELL}.png`; // TODO: y-coordinate up or down?
    }
    const colorHex = getColorHexById(pixelValue);
    return `/hex_colors_32/${colorHex}.png`;
}

// Initialize map after image data is loaded
async function initializeMap() {
    await loadImageData(); // Ensure image data is loaded first

    initialMap.value = L.map('map').setView([23.8041, 90.4152], BASE_ZOOM);

    //L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    //    maxZoom: 19,
    //    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    //}).addTo(initialMap.value);

    L.TileLayer.MyCustomLayer = L.TileLayer.extend({
        getTileUrl: function (coords) {
            //console.log(coords);
            const url = getTileUrl(coords);
            //console.log(url);
            return url; // Now sync function
        },
        _addTile: function (coords, container) {
            //console.log("_addTile", this.options.tileSize);
            if (true || coords.z < BASE_ZOOM) {
                this.options.tileSize = BASE_SIZE * (2**(coords.z - BASE_ZOOM));
                //console.log("coords.z less ", coords.z, " < " , BASE_ZOOM, " zoom to ", this.options.tileSize);
            } else {
                this.options.tileSize = BASE_SIZE;
                //console.log("coords.z 50 ", coords.z, " >= " , BASE_ZOOM, " zoom to ", this.options.tileSize);
            }
            //console.log("_addTile 2", this.options.tileSize);
            L.TileLayer.prototype._addTile.call(this, coords, container);
        }
    });

    // Static factory function
    L.tileLayer.myCustomLayer = function (templateUrl, options) {
        return new L.TileLayer.MyCustomLayer(templateUrl, options);
    };
    // Add the custom layer to the map
    L.tileLayer.myCustomLayer('images/map/{z}/C{x}_R{y}.jpg', {
        minZoom: 0,
        maxZoom: MAX_LOSSLESS_ZOOM,
        crs: L.CRS.Simple,
        tms: false,
        continuousWorld: false,
        noWrap: false,
        defaultRadius: 1,
        tileSize: BASE_SIZE,
        worldCopyJump: false,
    }).addTo(initialMap.value);
    let bounds = [[0, 0], [imageWidth, imageHeight]];
    initialMap.value.setMaxBounds(bounds); // TODO: keep?
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

// Initialize color data before map starts
async function initializeApp() {
    await loadColorData(); // Preload color mappings
    await initializeMap(); // Then initialize the map
    await loadValidElementIdxImages(); // Preload valid element idx images
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
