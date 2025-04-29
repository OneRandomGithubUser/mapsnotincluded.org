<template>
  <div class="iframe-container">
    <iframe ref="iframeRef" :src="iframeUrl" frameborder="0" allow="clipboard-read; clipboard-write; cross-origin-isolated"></iframe>
    <div class="map-container" id="map-container-a">
      <h3>Map!</h3>
      <div class="leaflet-map" id="map"></div>
    </div>
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
import {initializeMap as initializeLeafletWebGL2Map, map as LeafletWebGL2Map} from "@/components/LeafletWebGL2Map";
// import {initializeApp as initializeLeafletCanvasMap} from "@/components/LeafletCanvasMap";
import {loadImagesAsync} from "@/components/LoadImage"; // Import the class

const route = useRoute();

const MAPEXPLORER_URL = import.meta.env.VITE_MAPEXPLORER_URL || 'http://localhost:8080/'; // https://stefan-oltmann.de/oni-seed-browser';

const iframeUrl = ref(null)
const iframeRef = ref(null)
const queryParams = ref({});
const mapSizesRef = ref(new Map());

function requestLeafletBoxes() {
  // Only send the message if the iframe is loaded
  const iframe = iframeRef.value;
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage("getLeafletBoxes", "*");
  }
  requestAnimationFrame(requestLeafletBoxes); // Keep looping
}

// Start polling via requestAnimationFrame
requestAnimationFrame(requestLeafletBoxes);

// Listen for messages from the iframe
window.addEventListener("message", (event) => {
  if (event.data?.type === "leafletBoxes") {
    try {
      const boxes = JSON.parse(event.data.boxes);
      if (boxes.length > 0) {
        const { x, y, width, height } = boxes[0];
        const coordKey = `${x},${y}`;
        const mapDiv = document.getElementById("map-container-a");

        if (mapDiv) {
          const mapSizes = mapSizesRef.value;
          // Look up previous size
          const prev = mapSizes.get(coordKey);

          const hasSizeChanged = !prev || prev.width !== width || prev.height !== height;

          // Update styles
          mapDiv.style.position = "absolute";
          mapDiv.style.left = `${x}px`;
          mapDiv.style.top = `${y}px`;
          mapDiv.style.width = `${width}px`;
          mapDiv.style.height = `${height}px`;

          if (hasSizeChanged) {
            // Store new size
            mapSizes.set(coordKey, { width, height });

            // Trigger resize update
            LeafletWebGL2Map.value.invalidateSize();
          } else {
            // Size unchanged; skipping invalidateSize
          }
        } else {
          console.warn("No element with id 'map-container-a' found.");
        }
      }
    } catch (err) {
      console.error("Failed to parse leaflet boxes:", err);
    }
  }
});

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

  // Start the map
  initializeLeafletWebGL2Map();
  // initializeLeafletCanvasMap();
  
})
</script>

<style scoped>
main {
  overflow: hidden;
  height: 100vh; 
}

.iframe-container {
  position: relative;
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

.map-container {
  position: absolute;
  display: flex;
  flex-direction: column;
  padding: 15px;
}

.leaflet-map {
  flex: 1 1 auto; /* Take remaining space */
  background-color: #fff;
  z-index: 1; /* Ensure the map is above the iframe */
}
</style>
