<template>
    <div>
      <button @click="createCanvas('canvas1')">Create Canvas 1</button>
      <button @click="drawOnCanvas('canvas1')">Draw on Canvas 1</button>
      <button @click="clearCanvas('canvas1')">Clear Canvas 1</button>
      <button @click="getCanvasImage('canvas1')">Get Image</button>
  
      <div v-if="canvasImages['canvas1']">
        <p>Canvas 1 Render:</p>
        <img :src="canvasImages['canvas1']" />
      </div>
    </div>
  </template>
  
  <script>
  import { ref } from "vue";
  import WebGL2CanvasManager from "@/components/WebGL2.js"; // Import the class
  


  export default {
    setup() {
      const canvases = ref({});
      const canvasImages = ref({});
  
      const createCanvas = (id) => {
        if (!canvases.value[id]) {
          canvases.value[id] = new WebGL2CanvasManager(300, 300);
        }
      };
  
      const drawOnCanvas = (id) => {
        if (canvases.value[id]) {
          canvases.value[id].setRectangle(50, 50, 100, 100);
        }
      };
  
      const clearCanvas = (id) => {
        if (canvases.value[id]) {
          canvases.value[id].clearCanvas();
        }
      };
  
      const getCanvasImage = (id) => {
        if (canvases.value[id]) {
          canvasImages.value[id] = canvases.value[id].getImage();
        }
      };
  
      return {
        createCanvas,
        drawOnCanvas,
        clearCanvas,
        getCanvasImage,
        canvasImages,
      };
    },
  };
  </script>
  