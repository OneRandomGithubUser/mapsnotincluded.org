<template>
  <div class="iframe-container">
    <iframe ref="iframeRef" :src="iframeUrl" frameborder="0" allow="clipboard-read; clipboard-write"></iframe>
  </div>
  <div>
   <h3>Map!</h3>
   <div id="map" style="height:90vh;"></div>
   <canvas ref="canvasRef"></canvas>
</div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import { useUserStore } from '@/stores';

import { initializeApp, BASE_ZOOM, MAX_LOSSLESS_ZOOM, BASE_SIZE, imageWidth, imageHeight } from './tileRendererWorker.js'; // Import the worker with Vite's worker plugin
import TileRendererWorker from './tileRendererWorker.js?worker'; // Import the worker with Vite's worker plugin
const canvasRef = ref(null);

import "leaflet/dist/leaflet.css"
import * as L from 'leaflet';


const initialMap = ref(null);



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

            // create a new canvas
            const offscreen = document.createElement('canvas').transferControlToOffscreen();

            // Initialize Web Worker for tile rendering
            const worker = new TileRendererWorker();
            //const offscreen = canvasRef.value.transferControlToOffscreen(); // Use Vue's ref instead of querySelector

            // Send rendering task to the worker
            worker.postMessage(
              { canvas: offscreen, x: 0, y: 0, z: 5, BASE_SIZE: 256, BASE_ZOOM: 7 },
              [offscreen]
            );

            // Listen for completion
            worker.onmessage = (e) => {
              if (e.data === "done") {
                console.log("Tile rendering completed!");
              }
            };
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


// Start the application and run initializeMap when finished
initializeApp().then(() => {
  initializeMap();
});



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

  if (!canvasRef.value) return;

  // Initialize Web Worker for tile rendering
  const worker = new TileRendererWorker();
  const offscreen = canvasRef.value.transferControlToOffscreen(); // Use Vue's ref instead of querySelector

  // Send rendering task to the worker
  worker.postMessage(
    { canvas: offscreen, x: 0, y: 0, z: 5, BASE_SIZE: 256, BASE_ZOOM: 7 },
    [offscreen]
  );

  // Listen for completion
  worker.onmessage = (e) => {
    if (e.data === "done") {
      console.log("Tile rendering completed!");
    }
  };
  
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
