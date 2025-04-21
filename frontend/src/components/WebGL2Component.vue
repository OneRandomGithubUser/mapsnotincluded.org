<template>
  <div>
    <div>
      <button @click="createCanvas('canvas1')">Create Canvas 1</button>
      <button @click="drawOnCanvas('canvas1')">Draw on Canvas 1</button>
      <button @click="clearCanvas('canvas1')">Clear Canvas 1</button>
      <button @click="getCanvasImageBlob('canvas1')">Get Image 1 (Blob)</button>
      <button @click="getCanvasImageBitmap('canvas1')">Get Image (Bitmap)</button>
    </div>
    <div>
      <button @click="createCanvas('canvas2')">Create Canvas 2</button>
      <button @click="drawOnCanvas('canvas2')">Draw on Canvas 2</button>
      <button @click="clearCanvas('canvas2')">Clear Canvas 2</button>
      <button @click="getCanvasImageBlob('canvas2')">Get Image 2 (Blob)</button>
      <button @click="getCanvasImageBitmap('canvas2')">Get Image 2 (Bitmap)</button>
    </div>

    <div v-if="canvases">
      <div v-if="canvases['canvas1']">
        <p>Canvas 1 Render:</p>
        <img :src="canvases['canvas1']?.canvasImage" />
      </div>

      <div v-if="canvases['canvas2']">
        <p>Canvas 2 Render:</p>
        <img :src="canvases['canvas2']?.canvasImage" />
      </div>
    </div>
  </div>
</template>

<script>
import { ref } from "vue";
import WebGL2CanvasManager from "@/components/WebGL2_ts";
import {loadImagesAsync} from "./LoadImage";


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
    const canvasManager = ref(null);

    const numCellsWorldWidth = ref(null);
    const numCellsWorldHeight = ref(null);

    const smallRender = {
      "canvas1": true,
      "canvas2": false,
    };

    const createCanvas = async (id) => {
      if (!canvasManager.value) {
        // TODO: move OffscreenCanvas initialization to canvas manager class
        console.log("Initializing canvas manager");
        const newCanvas = new OffscreenCanvas(300, 300);
        canvasManager.value = new WebGL2CanvasManager(newCanvas);
        const canvas_manager = canvasManager.value;

        console.log("Setting up canvas manager");

        console.log("  Loading images");

        const NATURAL_TILES_TEXTURE_SIZE = 1024;

        let image_urls = [
          "/elementIdx8.png",
          "/temperature32.png",
          "/mass32.png",
          "/element_data_1x1.png"
        ];

        for (let tileSize = NATURAL_TILES_TEXTURE_SIZE; tileSize >= 1; tileSize /= 2) {
          image_urls.push(`/tiles_mipmaps/${tileSize}x${tileSize}.png`);
        }

        const images = await loadImagesAsync(image_urls);

        console.log("  Bitmapping images");

        const imageBitmaps = await Promise.all(images.map(img => createImageBitmap(img)));

        console.log("  Inserting images to canvas manager");

        numCellsWorldWidth.value = images[0].width;
        numCellsWorldHeight.value = images[0].height;
        canvas_manager.setup(imageBitmaps, () => {console.log("setup finished");});
        console.log("Created canvas manager!");
      }
      if (!canvases.value[id]) {
        canvases.value[id] = {
          canvasImage: null,
          blobUrl: null,
        };

        const canvas_manager = canvasManager.value;

        // call loadImages with random values for width, height, x, y

        const scale = 10;
        const { width, height, x_offset, y_offset, canvas_width, canvas_height } =
          smallRender[id]
            ? {
              width: 4,
              height: 4,
              x_offset: -128,
              y_offset: -128,
              canvas_width: 512,
              canvas_height: 512,
            }
            : {
              width: getRandomInt(636 / scale, 636 * 2 / scale),
              height: getRandomInt(404 / scale, 404 * 2 / scale),
              x_offset: getRandomInt(20, 30),
              y_offset: getRandomInt(20, 30),
              canvas_width: 636 * 2,
              canvas_height: 404 * 2,
            };
        canvas_manager.render(numCellsWorldWidth.value, numCellsWorldHeight.value, width, height, x_offset, y_offset, canvas_width, canvas_height, () => {console.log("render finished");});
      }
    };
    const drawOnCanvas = (id) => {
      if (canvases.value[id]) {

          const canvas_manager = canvasManager.value;

          // call loadImages with random values for width, height, x, y

          const NATURAL_TILES_TEXTURE_SIZE = 1024;

          const scale = 10;
          const { width, height, x_offset, y_offset, canvas_width, canvas_height } =
              smallRender[id]
              ? {
                width: 4,
                height: 4,
                x_offset: -128 + getRandomInt(0, 3),
                y_offset: -128 + getRandomInt(0, 3),
                canvas_width: 512,
                canvas_height: 512,
              }
              : {
                width: getRandomInt(636 / scale, 636 * 2 / scale),
                height: getRandomInt(404 / scale, 404 * 2 / scale),
                x_offset: getRandomInt(20, 30),
                y_offset: getRandomInt(20, 30),
                canvas_width: 636 * 2,
                canvas_height: 404 * 2,
              };

          canvas_manager.render(numCellsWorldWidth.value, numCellsWorldHeight.value, width, height, x_offset, y_offset, canvas_width, canvas_height, () => {console.log("render finished");});
        //canvases.value[id].setRectangle(50, 50, 100, 100);
      }
    };

    const clearCanvas = (id) => {
      if (canvases.value[id]) {
        canvases.value[id].canvasManager.clearCanvas();
      }
    };

    const getCanvasImageBlob = async (id) => {
      if (!canvases.value[id]) return;

      try {
        const canvas_manager = canvasManager.value;
        const blob = await canvas_manager.getImageBlob(); // WebGL2Proxy
        const url = URL.createObjectURL(blob);

        if (canvases.value[id].blobUrl) {
          URL.revokeObjectURL(canvases.value[id].blobUrl);
        }

        canvases.value[id].blobUrl = url;
        canvases.value[id].canvasImage = url;

      } catch (err) {
        console.error(`Failed to get canvas image for ${id}`, err);
        throw err;
      }
    };

    const getCanvasImageBitmap = async (id) => {
      if (!canvases.value[id]) return;

      try {
        const canvas_manager = canvasManager.value;
        const bitmap = await canvas_manager.getImageBitmap(); // WebGL2Proxy

        // Create a visible canvas to draw the bitmap into
        const ocanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        ocanvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
        const blob = await ocanvas.convertToBlob({ type: 'image/webp' });
        const url = URL.createObjectURL(blob);

        if (canvases.value[id].blobUrl) {
          URL.revokeObjectURL(canvases.value[id].blobUrl);
        }

        canvases.value[id].blobUrl = url;
        canvases.value[id].canvasImage = url;

      } catch (err) {
        console.error(`Failed to get canvas image bitmap for ${id}`, err);
        throw err;
      }
    };

    return {
      createCanvas,
      drawOnCanvas,
      clearCanvas,
      getCanvasImageBlob,
      getCanvasImageBitmap,
      canvases,
    };
  },
};
</script>
  