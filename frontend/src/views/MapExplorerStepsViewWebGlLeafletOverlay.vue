<template>
  <div class="iframe-container">
    <iframe ref="iframeRef" :src="iframeUrl" frameborder="0" allow="clipboard-read; clipboard-write; cross-origin-isolated"></iframe>
    <div class="map-clipping-wrapper" id="map-clipping-wrapper-1">
      <div class="map-container" id="map-container-1">
        <div class="map-wrapper">
          <h3>Map!</h3>
          <div class="leaflet-map" id="map"></div>
          <div class="map-footer">⚠️ Experimental Feature ⚠️</div>
        </div>
      </div>
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
      const boxes = JSON.parse(event.data.boxesJson);
      const mapContainers = boxes["map-containers"];
      const visibleScrollBounds = boxes["visible-scroll-bounds"];
      const visible = boxes["visible"];
      const mapClippingWrapper = document.getElementById("map-clipping-wrapper-1");
      mapClippingWrapper.style.visibility = visible ? "visible" : "hidden";

      if (mapContainers.length > 0) {
        const { left: visLeft, top: visTop, right: visRight, bottom: visBottom } = visibleScrollBounds[0];
        const { left, top, right, bottom, seed } = mapContainers[0];
        const coordKey = seed;
        const mapDiv = document.getElementById("map-container-1");

        if (mapDiv) {
          const mapWidth = right - left;
          const mapHeight = bottom - top;
          const offsetLeft = left - visLeft;
          const offsetTop = top - visTop;

          const visWidth = visRight - visLeft;
          const visHeight = visBottom - visTop;

          mapClippingWrapper.style.left = `${visLeft}px`;
          mapClippingWrapper.style.top = `${visTop}px`;
          mapClippingWrapper.style.width = `${visWidth}px`;
          mapClippingWrapper.style.height = `${visHeight}px`;

          mapDiv.style.left = `${offsetLeft}px`;
          mapDiv.style.top = `${offsetTop}px`;
          mapDiv.style.width = `${mapWidth}px`;
          mapDiv.style.height = `${mapHeight}px`;

          const mapSizes = mapSizesRef.value;

          // Look up previous size
          const prev = mapSizes.get(coordKey);

          const hasSizeChanged = !prev || prev.mapWidth !== mapWidth || prev.mapHeight !== mapHeight;

          if (hasSizeChanged) {
            // Store new size
            mapSizes.set(coordKey, { mapWidth, mapHeight });

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
  pointer-events: auto;
}

.leaflet-map {
  flex: 1 1 auto; /* Take remaining space */
  background-color: #fff;
  z-index: 1; /* Ensure the map is above the iframe */
}

.map-wrapper {
  border: 2px solid purple;
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;   /* Ensures children stay within rounded edge */
}

.map-clipping-wrapper {
  /* border: 2px dashed lime; for debugging */
  overflow: hidden;
  position: absolute;
  pointer-events: none;
}

.map-footer {
  background-color: purple;
  color: white;
  font-weight: bold;
  text-align: center;
  padding: 4px;
  font-size: 0.9em;
  flex: 0 0 auto;
}
</style>
