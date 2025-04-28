import WebGL2Proxy from "@/components/WebGL2WebWorkerProxy";
import {loadImagesAsync} from "@/components/LoadImage";
import canvasToBase64 from "@/components/CanvasToBase64";

import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

import "leaflet/dist/leaflet.css"
import * as L from 'leaflet';

const map = ref(null);
const webGLCanvas = ref(null); // Store single WebGL2Proxy instance
let webGLInitPromise = null;
const numCellsWorldWidth = ref(null);
const numCellsWorldHeight = ref(null)

const ZOOM_0_CELLS_PER_MAP_UNIT = 8; // Base tile size for the map - this is purposefully not 1 to make sure code accounts for this!!
const METERS_PER_CELL = 1;
const MAP_UNITS_PER_ZOOM_0_MAP_TILE = 256; // Leaflet default
const ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE = ZOOM_0_CELLS_PER_MAP_UNIT * MAP_UNITS_PER_ZOOM_0_MAP_TILE; // Make sure dimensional analysis checks out!!
const CELLS_PER_NATURAL_TEXTURE_TILE = 8; // Number of cells per texture tile, lengthwise
const MAX_LOSSLESS_MAP_UNITS_PER_CELL = 128; // Maximum size per cell
const MAX_LOSSLESS_ZOOM = get_zoom_from_map_units_per_cell(MAX_LOSSLESS_MAP_UNITS_PER_CELL); // Maximum zoom level for lossless tiles

function get_map_units_per_cell_from_zoom(zoom) {
    return 2 ** zoom;
}

function get_cells_per_zoom_0_map_tile_from_zoom(zoom) {
    return ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE / get_map_units_per_cell_from_zoom(zoom);
}

function get_bounded_zoom(zoom) {
    return Math.min(MAX_LOSSLESS_ZOOM, zoom);
}

function get_zoom_from_map_units_per_cell(size) {
    return Math.log2(size);
}

const initializeWebGL = () => {
    if (webGLInitPromise) {
        // Initialization is already happening or finished, reuse it
        return webGLInitPromise;
    }

    webGLInitPromise = new Promise(async (resolve) => {
        if (!webGLCanvas.value) {
            {
                console.log("Initializing canvas manager");
                webGLCanvas.value = new WebGL2Proxy();
                const canvas_manager = webGLCanvas.value;

                console.log("Setting up canvas manager");

                console.log("  Loading images");

                const NATURAL_TILES_TEXTURE_SIZE = 1024;

                let image_urls = [
                    "/elementIdx8.png",
                    "/temperature32.png",
                    "/mass32.png",
                    "/element_data_1x1.png",
                    "/space_00.png",
                    "/space_01.png"
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

                const numMapUnitsWorldWidth = numCellsWorldWidth.value / ZOOM_0_CELLS_PER_MAP_UNIT;
                const numMapUnitsWorldHeight = numCellsWorldHeight.value / ZOOM_0_CELLS_PER_MAP_UNIT;
                const NUM_WORLD_DISTANCES_BEYOND_BOUNDS = 2;
                const bounds =
                    [[(-NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldWidth, (-NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldHeight],
                        [(1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldWidth, (1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldHeight]];
                map.value.setMaxBounds(bounds); // TODO: change?

                const worldCenterX = numCellsWorldWidth.value / 2 / ZOOM_0_CELLS_PER_MAP_UNIT;
                const worldCenterY = -numCellsWorldHeight.value / 2 / ZOOM_0_CELLS_PER_MAP_UNIT;
                const worldCenterLatLong = [worldCenterY, worldCenterX];
                map.value.setView(worldCenterLatLong, 4)
                console.log(worldCenterLatLong, "worldCenterLatLong");

                await canvas_manager.setup(imageBitmaps);
                console.log("Created canvas manager!");
            }/*
      TODO: make sure
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
      */
            resolve(); // ✅ Ensure the promise resolves after setup
        } else {
            resolve(); // If already initialized, resolve immediately
        }
    });

    return webGLInitPromise;
};

const drawDebugInfo = (ctx, coords, width, height) => {
    // 🟥 Draw white outline for the border
    ctx.strokeStyle = "white";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, width, height);

    // 🟥 Draw red border over the white outline
    ctx.strokeStyle = "red";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);

    // 🖍️ Set up font properties
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 🏳️ White outline for tile coordinates text
    ctx.lineWidth = 4;
    ctx.strokeStyle = "white";
    ctx.strokeText(`(${coords.x}, ${coords.y}, ${coords.z})`, width / 2, height / 2 - 10);

    // 🟥 Red text for tile coordinates
    ctx.fillStyle = "red";
    ctx.fillText(`(${coords.x}, ${coords.y}, ${coords.z})`, width / 2, height / 2 - 10);

    // 🏳️ White outline for tile size text (placed slightly below the coordinates)
    ctx.strokeStyle = "white";
    ctx.strokeText(`${width} × ${height} px`, width / 2, height / 2 + 10);

    // 🟥 Red text for tile size
    ctx.fillStyle = "red";
    ctx.fillText(`${width} × ${height} px`, width / 2, height / 2 + 10);
};

const initializeMap = () => {
    if (!map.value) {
        const MapsNotIncludedCRS = L.extend({}, L.CRS.Simple, {
            distance: function (latlng1, latlng2) {
                const dx = latlng2.lng - latlng1.lng;
                const dy = latlng2.lat - latlng1.lat;
                const mapUnitsDistance = Math.sqrt(dx * dx + dy * dy);

                const METERS_PER_MAP_UNIT = ZOOM_0_CELLS_PER_MAP_UNIT * METERS_PER_CELL;

                return mapUnitsDistance * METERS_PER_MAP_UNIT;
            }
        });

        map.value = L.map("map", {
            crs: MapsNotIncludedCRS,
        }).setView([0,0], 4);

        L.TileLayer.PlaceholderLayer = L.TileLayer.extend({
            getTileUrl: function(coords) {
                return '/mode_nominal_256.png';
            },
            getAttribution: function() {
                return "Klei Entertainment, Maps Not Included"
            }
        });

        L.tileLayer.placeholderLayer = function (opts) {
            return new L.TileLayer.PlaceholderLayer(opts);
        };

        L.tileLayer.placeholderLayer().addTo(map.value);


        L.GridLayer.MyCanvasLayer = L.GridLayer.extend({
            createTile: function (coords, done) {
                // if (!webGLCanvas.value) {
                //   console.error("WebGL2Proxy is not initialized");
                //   return;
                // }

                const tile = document.createElement("canvas");
                const size = this.getTileSize();
                tile.width = size.x;
                tile.height = size.y;
                //var ctx = tile.getContext("2d");

                // ✅ Wait for WebGL setup before rendering
                initializeWebGL().then(async () => {

                    const canvas_size = get_map_units_per_cell_from_zoom(coords.z);
                    const xy_scale = get_cells_per_zoom_0_map_tile_from_zoom(coords.z);
                    const x_offset = -1 * coords.x * xy_scale;
                    const y_offset = (coords.y + 1) * xy_scale - numCellsWorldHeight.value;

                    console.log("xyz", coords, canvas_size, xy_scale, x_offset, y_offset);

                    console.log("begin render");
                    const [_, bitmap] = await webGLCanvas.value
                        .sequence()
                        .render(
                            numCellsWorldWidth.value,
                            numCellsWorldHeight.value,
                            xy_scale, xy_scale,
                            x_offset, y_offset,
                            size.x, size.y
                        ).transferImageBitmap()
                        .exec();
                    console.log("finish render");
                    console.log(bitmap);

                    try {

                        const debugOutlines = true;
                        const debugUrlPrint = false;

                        if (debugOutlines) {
                            const tile_2d_ctx = tile.getContext('2d');
                            tile_2d_ctx.drawImage(bitmap, 0, 0);
                            drawDebugInfo(tile_2d_ctx, coords, size.x, size.y);
                        } else {
                            const tile_bmp_ctx = tile.getContext('bitmaprenderer');
                            tile_bmp_ctx.transferFromImageBitmap(bitmap);
                        }

                        if (debugUrlPrint) {
                            canvasToBase64(tile).then((base64) => {
                                console.log(`Tile (${coords.x},${coords.y},${coords.z}) base64:`, base64);
                            });
                        }

                        //tileWrapper.replaceChild(tile, placeholder);
                        //done(null, tileWrapper);
                        done(null, tile);
                    } catch (err) {
                        console.error(`Failed to get canvas image bitmap`, err);
                        throw err;
                    }
                });

                return tile;
            },
            getAttribution: function() {
                return "Klei Entertainment, Maps Not Included"
            },
        });

        L.gridLayer.myCanvasLayer = function (opts) {
            return new L.GridLayer.MyCanvasLayer(opts);
        };

        L.gridLayer.myCanvasLayer().addTo(map.value);
        L.control.scale().addTo(map.value);
    }
}

export { initializeMap as initializeMap };