<template>
    <div class="iframe-container">
      <iframe ref="iframeRef" :src="iframeUrl" frameborder="0" allow="clipboard-read; clipboard-write"></iframe>
    </div>
    
    <div>
      <h1>Canvas Manager Example</h1>
      <WebGL2Component />
    </div>
  </template>
  
  <script setup>
  import { onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  
  import { useUserStore } from '@/stores';

  import WebGL2Component from '@/components/WebGL2Component.vue';

  const webglCanvas = ref(null);
  const webglCanvas2 = ref(null);
  
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