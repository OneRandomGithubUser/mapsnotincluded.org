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

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import { useUserStore } from '@/stores';

import "leaflet/dist/leaflet.css"
import * as L from 'leaflet';

import WebGL2Proxy from "@/components/WebGL2WebWorkerProxy";// "@/components/WebGL2.ts";
import {initializeMap as initializeLeafletWebGL2Map, map as LeafletWebGL2Map} from "@/components/LeafletWebGL2Map";
// import {initializeApp as initializeLeafletCanvasMap} from "@/components/LeafletCanvasMap";
import { useLeafletMapSync } from "@/components/LeafletMessageBrowserIframe"
import {loadImagesAsync} from "@/components/LoadImage";

const route = useRoute();

const MAPEXPLORER_URL = import.meta.env.VITE_MAPEXPLORER_URL || 'http://localhost:8080/'; // https://stefan-oltmann.de/oni-seed-browser';

const iframeUrl = ref(null);
const queryParams = ref({});

const iframeRef = ref<HTMLIFrameElement | null>(null);
const mapSizesRef = ref(new Map<string, { mapWidth: number; mapHeight: number }>());

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

  // Sync the map sizes with the iframe
  useLeafletMapSync(iframeRef, mapSizesRef, LeafletWebGL2Map);
  
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
