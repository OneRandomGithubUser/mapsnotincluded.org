import WebGL2Proxy from "@/components/WebGL2WebWorkerProxy";
import { loadImagesAsync } from "@/components/LoadImage";
import { canvasToBase64 } from "@/components/MediaToBase64";

import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import "leaflet/dist/leaflet.css";
import * as L from "leaflet";

interface TileCoords {
    x: number;
    y: number;
    z: number;
}

const DEBUG_OUTLINES = false;
const DEBUG_URL_PRINT = false;
const DEBUG_TILE_TIMING = false; // enable/disable debug timings

const ZOOM_0_CELLS_PER_MAP_UNIT = 8; // Base tile size for the map - this is purposefully not 1 to make sure code accounts for this!!
const METERS_PER_CELL = 1;
const MAP_UNITS_PER_ZOOM_0_MAP_TILE = 256; // Leaflet default
const ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE = ZOOM_0_CELLS_PER_MAP_UNIT * MAP_UNITS_PER_ZOOM_0_MAP_TILE; // Make sure dimensional analysis checks out!!
const CELLS_PER_NATURAL_TEXTURE_TILE = 8; // Number of cells per texture tile, lengthwise
const MAX_LOSSLESS_MAP_UNITS_PER_CELL = 128; // Maximum size per cell
const MAX_LOSSLESS_ZOOM = get_zoom_from_map_units_per_cell(MAX_LOSSLESS_MAP_UNITS_PER_CELL); // Maximum zoom level for lossless tiles

const map = ref<L.Map | null>(null);
const webGLCanvas = ref<WebGL2Proxy | null>(null);
let webGLInitPromise: Promise<void> | null = null;
const numCellsWorldWidth = ref<number | null>(null);
const numCellsWorldHeight = ref<number | null>(null);

function get_map_units_per_cell_from_zoom(zoom: number): number {
    return 2 ** zoom;
}

function get_cells_per_zoom_0_map_tile_from_zoom(zoom: number): number {
    return ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE / get_map_units_per_cell_from_zoom(zoom);
}

function get_bounded_zoom(zoom: number): number {
    return Math.min(MAX_LOSSLESS_ZOOM, zoom);
}

function get_zoom_from_map_units_per_cell(size: number): number {
    return Math.log2(size);
}

const initializeWebGL = (): Promise<void> => {
    if (webGLInitPromise) {
        return webGLInitPromise;
    }

    webGLInitPromise = new Promise(async (resolve) => {
        if (!webGLCanvas.value) {
            console.log("Initializing canvas manager");
            webGLCanvas.value = new WebGL2Proxy();
            const canvasManager = webGLCanvas.value;

            console.log("Setting up canvas manager");
            console.log("  Loading images");

            const NATURAL_TILES_TEXTURE_SIZE = 1024;

            const imageUrls: string[] = [
                "/elementIdx8.png",
                "/temperature32.png",
                "/mass32.png",
                "/element_data_1x1.png",
                "/space_00.png",
                "/space_01.png",
            ];

            for (let tileSize = NATURAL_TILES_TEXTURE_SIZE; tileSize >= 1; tileSize /= 2) {
                imageUrls.push(`/tiles_mipmaps/${tileSize}x${tileSize}.png`);
            }

            const images = await loadImagesAsync(imageUrls);
            const imageBitmaps = await Promise.all(images.map(img => createImageBitmap(img)));

            numCellsWorldWidth.value = images[0].width;
            numCellsWorldHeight.value = images[0].height;

            const numMapUnitsWorldWidth = numCellsWorldWidth.value / ZOOM_0_CELLS_PER_MAP_UNIT;
            const numMapUnitsWorldHeight = numCellsWorldHeight.value / ZOOM_0_CELLS_PER_MAP_UNIT;
            const NUM_WORLD_DISTANCES_BEYOND_BOUNDS = 2;
            const bounds: L.LatLngBoundsExpression = [
                [
                    (-NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldWidth,
                    (-NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldHeight
                ],
                [
                    (1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldWidth,
                    (1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldHeight
                ]
            ];
            map.value?.setMaxBounds(bounds);

            const worldCenterX = numCellsWorldWidth.value / 2 / ZOOM_0_CELLS_PER_MAP_UNIT;
            const worldCenterY = -numCellsWorldHeight.value / 2 / ZOOM_0_CELLS_PER_MAP_UNIT;
            const worldCenterLatLong: [number, number] = [worldCenterY, worldCenterX];
            map.value?.setView(worldCenterLatLong, 4);

            await canvasManager.setup(imageBitmaps);

            console.log("Created canvas manager!");/*
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
        }
        resolve();
    });

    return webGLInitPromise;
};

const drawDebugInfo = (ctx: CanvasRenderingContext2D, coords: TileCoords, width: number, height: number): void => {
    ctx.strokeStyle = "white";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, width, height);

    ctx.strokeStyle = "red";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);

    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.lineWidth = 4;
    ctx.strokeStyle = "white";
    ctx.strokeText(`(${coords.x}, ${coords.y}, ${coords.z})`, width / 2, height / 2 - 10);

    ctx.fillStyle = "red";
    ctx.fillText(`(${coords.x}, ${coords.y}, ${coords.z})`, width / 2, height / 2 - 10);

    ctx.strokeStyle = "white";
    ctx.strokeText(`${width} × ${height} px`, width / 2, height / 2 + 10);

    ctx.fillStyle = "red";
    ctx.fillText(`${width} × ${height} px`, width / 2, height / 2 + 10);
};

const initializeMap = (): void => {
    if (!map.value) {
        const MapsNotIncludedCRS: L.CRS = L.extend({}, L.CRS.Simple, {
            distance: (latlng1: L.LatLngExpression, latlng2: L.LatLngExpression): number => {
                const l1 = L.latLng(latlng1);
                const l2 = L.latLng(latlng2);

                const dx = l2.lng - l1.lng;
                const dy = l2.lat - l1.lat;
                const mapUnitsDistance = Math.sqrt(dx * dx + dy * dy);

                const METERS_PER_MAP_UNIT = ZOOM_0_CELLS_PER_MAP_UNIT * METERS_PER_CELL;
                return mapUnitsDistance * METERS_PER_MAP_UNIT;
            }
        });

        map.value = L.map("map", { crs: MapsNotIncludedCRS, minZoom: -5, maxZoom: 20, zoomSnap: 0 }).setView([0, 0], 4);

        const PlaceholderLayer = L.TileLayer.extend({
            getTileUrl(_coords: TileCoords): string {
                return "/mode_nominal_256.png";
            },
            getAttribution(): string {
                return "Klei Entertainment, Maps Not Included";
            }
        });

        (L.tileLayer as any).placeholderLayer = (opts?: L.TileLayerOptions) => new PlaceholderLayer(opts);
        (L.tileLayer as any).placeholderLayer().addTo(map.value);

        const MyCanvasLayer = L.GridLayer.extend({
            createTile: function (coords: TileCoords, done: (error: Error | null, tile: HTMLCanvasElement) => void): HTMLCanvasElement {
                const tile = document.createElement("canvas");
                const size = this.getTileSize();
                tile.width = size.x;
                tile.height = size.y;

                initializeWebGL().then(async () => {
                    const startTime = DEBUG_TILE_TIMING ? performance.now() : 0;

                    const canvasSize = get_map_units_per_cell_from_zoom(coords.z);
                    const xyScale = get_cells_per_zoom_0_map_tile_from_zoom(coords.z);
                    const xOffset = -1 * coords.x * xyScale;
                    const yOffset = (coords.y + 1) * xyScale - (numCellsWorldHeight.value ?? 0);

                    const [_, bitmap] = await webGLCanvas.value!.sequence()
                        .render(
                            numCellsWorldWidth.value!,
                            numCellsWorldHeight.value!,
                            xyScale, xyScale,
                            xOffset, yOffset,
                            size.x, size.y
                        ).transferImageBitmap()
                        .exec();

                    try {

                        if (DEBUG_OUTLINES) {
                            const ctx = tile.getContext("2d")!;
                            ctx.drawImage(bitmap, 0, 0);
                            drawDebugInfo(ctx, coords, size.x, size.y);
                        } else {
                            const ctx = tile.getContext("bitmaprenderer")!;
                            ctx.transferFromImageBitmap(bitmap);
                        }

                        if (DEBUG_URL_PRINT) {
                            canvasToBase64(tile).then(base64 => {
                                console.log(`Tile (${coords.x},${coords.y},${coords.z}) base64:`, base64);
                            });
                        }

                        if (DEBUG_TILE_TIMING) {
                            const endTime = performance.now();
                            console.log(`Tile (${coords.x},${coords.y},${coords.z}) rendered in ${(endTime - startTime).toFixed(2)} ms`);
                        }

                        done(null, tile);
                    } catch (err) {
                        console.error("Failed to get canvas image bitmap", err);
                        done(err as Error, tile);
                    }
                });

                return tile;
            },
            getAttribution(): string {
                return "Klei Entertainment, Maps Not Included";
            }
        });

        (L.gridLayer as any).myCanvasLayer = (opts?: L.GridLayerOptions) => new MyCanvasLayer(opts);
        (L.gridLayer as any).myCanvasLayer().addTo(map.value);

        L.control.scale().addTo(map.value);

        // add more units to the Leaflet scale
        L.Control.Scale.include({

            _updateMetric: function (maxMeters: number) {
                let meters = this._getRoundNum(maxMeters);
                let label = '';
                let ratio = 1;

                if (maxMeters >= 1000) {
                    label = (meters / 1000) + ' km';
                    ratio = (meters / 1000) * 1000 / maxMeters;
                } else if (maxMeters >= 1) {
                    label = meters + ' m';
                    ratio = meters / maxMeters;
                } else if (maxMeters >= 0.01) {
                    let cm = this._getRoundNum(maxMeters * 100);
                    label = cm + ' cm';
                    ratio = cm / 100 / maxMeters;
                } else if (maxMeters >= 0.001) {
                    let mm = this._getRoundNum(maxMeters * 1000);
                    label = mm + ' mm';
                    ratio = mm / 1000 / maxMeters;
                } else if (maxMeters >= 1e-6) {
                    let um = this._getRoundNum(maxMeters * 1e6);
                    label = um + ' μm';
                    ratio = um / 1e6 / maxMeters;
                } else if (maxMeters >= 1e-9) {
                    let nm = this._getRoundNum(maxMeters * 1e9);
                    label = nm + ' nm';
                    ratio = nm / 1e9 / maxMeters;
                } else if (maxMeters >= 1e-10) {
                    let ang = this._getRoundNum(maxMeters * 1e10);
                    label = ang + ' Å';
                    ratio = ang / 1e10 / maxMeters;
                } else {
                    let pm = this._getRoundNum(maxMeters * 1e12);
                    label = pm + ' pm';
                    ratio = pm / 1e12 / maxMeters;
                }

                this._updateScale(this._mScale, label, ratio);
            },

            _updateImperial: function (maxMeters: number) {
                const feet = maxMeters * 3.2808399;
                const inches = maxMeters * 39.3700787;
                const mils = inches * 1000;
                let label = '';
                let ratio = 1;

                if (feet >= 5280) {
                    let miles = this._getRoundNum(feet / 5280);
                    label = miles + ' mi';
                    ratio = miles * 5280 / feet;
                } else if (feet >= 1) {
                    let f = this._getRoundNum(feet);
                    label = f + ' ft';
                    ratio = f / feet;
                } else if (inches >= 1) {
                    let inch = this._getRoundNum(inches);
                    label = inch + ' in';
                    ratio = inch / inches;
                } else {
                    let m = this._getRoundNum(mils);
                    label = m + ' mil';
                    ratio = m / mils;
                }

                this._updateScale(this._iScale, label, ratio);
            }

        });

    }
};

export { initializeMap, map };