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
  import WebGL2CanvasManager from "@/components/WebGL2_ts.js"; // Import the class
  import { loadImages } from "./LoadImage";


            function getRandomInt(min, max) {
                const min_int = Math.ceil(min);
                const max_int = Math.floor(max);
                const random = Math.floor(Math.random() * (max_int - min_int + 1)) + min_int;
                console.log(random);
                return random;
            }
  

  export default {
    setup() {
      const canvases = ref({});
      const canvasImages = ref({});

      const numCellsWorldWidth = ref(0);
      const numCellsWorldHeight = ref(0);
  
      const createCanvas = (id) => {
        if (!canvases.value[id]) {
          canvases.value[id] = new WebGL2CanvasManager(300, 300);

          const canvas_manager = canvases.value[id];

          // call loadImages with random values for width, height, x, y

          const NATURAL_TILES_TEXTURE_SIZE = 1024;

          const scale = 10;
          //const width = getRandomInt(636 / scale, 636 * 2 / scale);
          //const height = getRandomInt(404 / scale, 404 * 2 / scale);
          //const x_offset = getRandomInt(20, 30);
          //const y_offset = getRandomInt(20, 30);
          //const canvas_width = 636 * 2;
          //const canvas_height = 404 * 2;

          const width = 4;
          const height = 4;
          const x_offset = -128;
          const y_offset = -128;
          const canvas_width = 512;
          const canvas_height = 512;

          let image_urls = [
            "/elementIdx8.png",
            "/temperature32.png",
            "/mass32.png",
            "/element_data_1x1.png"
          ];

          for (let tileSize = NATURAL_TILES_TEXTURE_SIZE; tileSize >= 1; tileSize /= 2) {
            image_urls.push(`/tiles_mipmaps/${tileSize}x${tileSize}.png`);
          }


          loadImages(image_urls, (images) => {
            numCellsWorldWidth.value = images[0].width;
            numCellsWorldHeight.value = images[0].height;
            canvas_manager.setup(images, () => {canvas_manager.render(numCellsWorldWidth.value, numCellsWorldHeight.value, width, height, x_offset, y_offset, canvas_width, canvas_height, () => {console.log("render finished");})})
          });
        }
      };
      const drawOnCanvas = (id) => {
        if (canvases.value[id]) {

            const canvas_manager = canvases.value[id];

            // call loadImages with random values for width, height, x, y

            const NATURAL_TILES_TEXTURE_SIZE = 1024;

            const scale = 10;
            //const width = getRandomInt(636 / scale, 636 * 2 / scale);
            //const height = getRandomInt(404 / scale, 404 * 2 / scale);
            //const x_offset = getRandomInt(20, 30);
            //const y_offset = getRandomInt(20, 30);
            //const canvas_width = 636 * 2;
            //const canvas_height = 404 * 2;

            const width = 4;
            const height = 4;
            const x_offset = -128 + getRandomInt(0, 3);
            const y_offset = -128 + getRandomInt(0, 3);
            const canvas_width = 512;
            const canvas_height = 512;

            canvas_manager.render(numCellsWorldWidth.value, numCellsWorldHeight.value, width, height, x_offset, y_offset, canvas_width, canvas_height, () => {console.log("render finished");});
          //canvases.value[id].setRectangle(50, 50, 100, 100);
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
  