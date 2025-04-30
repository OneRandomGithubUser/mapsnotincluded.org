import WebGL2Proxy from "@/components/WebGL2WebWorkerProxy";
import {loadAndPad, loadImagesAsync} from "@/components/LoadImage";
import {bitmapToBase64, canvasToBase64, imageToBase64} from "@/components/MediaToBase64";

import {onMounted, Ref, ref, watch} from "vue";
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

class LeafletMapData {
    private readonly map: L.map;
    private isReadyToRender: boolean;
    private setupPromise: Promise<void> | null;
    constructor(
        map: L.map
    ) {
        this.map = map;
        this.isReadyToRender = false;
        this.setupPromise = null;
    }
    getMap(): L.map {
        return this.map;
    }
    getIsReadyToRender(): boolean {
        return this.isReadyToRender;
    }
    setIsReadyToRender(isReadyToRender: boolean): void {
        this.isReadyToRender = isReadyToRender;
    }

    getSetupPromise(): Promise<void> | null {
        return this.setupPromise;
    }

    setSetupPromise(promise: Promise<void>): void {
        this.setupPromise = promise;
    }

    clearSetupPromise(): void {
        this.setupPromise = null;
    }
}
const mapsRef = ref<Map<string, LeafletMapData>>(new Map());
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

            /*
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

             */

            // TODO: use an object for this
            const bgImages: {
                urls: string[],
                images : HTMLImageElement[],
                bitmaps : ImageBitmap[]
            } = {
                "urls" : [
                    "/space_00.png",
                    "/space_01.png",
                ],
                "images" : [],
                "bitmaps" : []
            }
            const elementDataImage: {
                urls: string[],
                images : HTMLImageElement[],
                bitmaps : ImageBitmap[]
            } = {
                "urls" : [
                    "/element_data_1x1.png"
                ],
                "images" : [],
                "bitmaps" : []
            }
            const tileImages: {
                urls: string[],
                images : HTMLImageElement[],
                bitmaps : ImageBitmap[]
            } = {
                "urls" : [],
                "images" : [],
                "bitmaps" : []
            }

            for (let tileSize = NATURAL_TILES_TEXTURE_SIZE; tileSize >= 1; tileSize /= 2) {
                tileImages.urls.push(`/tiles_mipmaps/${tileSize}x${tileSize}.png`);
            }

            for (const imageData of [bgImages, elementDataImage, tileImages]) {
                // TODO: batch async operations together better without awaiting for each one
                imageData.images = await loadImagesAsync(imageData.urls);
                imageData.bitmaps = await Promise.all(imageData.images.map(img => createImageBitmap(img)));
            }

            // await canvasManager.setup(imageBitmaps);
            await canvasManager.setup({
                elementDataImage: elementDataImage.bitmaps[0],
                bgImages: bgImages.bitmaps,
                tileImages: tileImages.bitmaps,
            });

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

export async function setupLeafletMap(
    leafletMap: L.Map,
    seed: string,
    htmlId: string
): Promise<void> {
    const leafletMapData = mapsRef.value.get(htmlId);
    if (!leafletMapData) {
        throw new Error(`Map container with htmlId ${htmlId} not found.`);
    }

    // ✅ Already set up?
    if (leafletMapData.getIsReadyToRender()) {
        return;
    }

    // ✅ Already being set up?
    const existing = leafletMapData.getSetupPromise();
    if (existing) {
        await existing;
        return;
    }

    // ✅ First caller — begin setup
    const setup = (async () => {
        const base = `/world_data/${seed}`;
        const urls = ["elementIdx8.png", "temperature32.png", "mass32.png"]
            .map(p => `${base}/${p}`);
        const bitmaps = await Promise.all(urls.map(u => loadAndPad(u, 1200, 500)));

        await webGLCanvas.value!.sequence().setup({ dataImages: bitmaps, seed }).exec();

        numCellsWorldWidth.value = bitmaps[0].width;
        numCellsWorldHeight.value = bitmaps[0].height;

        const numMapUnitsWorldWidth = numCellsWorldWidth.value / ZOOM_0_CELLS_PER_MAP_UNIT;
        const numMapUnitsWorldHeight = numCellsWorldHeight.value / ZOOM_0_CELLS_PER_MAP_UNIT;
        const NUM_WORLD_DISTANCES_BEYOND_BOUNDS = 2;

        const bounds: L.LatLngBoundsExpression = [
            [
                -NUM_WORLD_DISTANCES_BEYOND_BOUNDS * numMapUnitsWorldWidth,
                -NUM_WORLD_DISTANCES_BEYOND_BOUNDS * numMapUnitsWorldHeight,
            ],
            [
                (1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldWidth,
                (1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldHeight,
            ],
        ];

        leafletMap.setMaxBounds(bounds);

        // TODO: set view based on map size
        const worldCenterX = numCellsWorldWidth.value / 2 / ZOOM_0_CELLS_PER_MAP_UNIT;
        const worldCenterY = -numCellsWorldHeight.value / 2 / ZOOM_0_CELLS_PER_MAP_UNIT;
        leafletMap.setView([worldCenterY, worldCenterX], 4);

        leafletMapData.setIsReadyToRender(true);
        leafletMapData.clearSetupPromise();
    })();

    leafletMapData.setSetupPromise(setup);

    try {
        await setup;
    } catch (err) {
        leafletMapData.clearSetupPromise(); // allow retry
        throw err;
    }
}


const drawErrorOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.strokeStyle = "white";
    ctx.strokeText("ERROR", width / 2, height / 2 - 10);
    ctx.fillStyle = "red";
    ctx.fillText("ERROR", width / 2, height / 2 - 10)

    ctx.strokeStyle = "white";
    ctx.strokeText("loading tile", width / 2, height / 2 + 10);
    ctx.fillStyle = "red";
    ctx.fillText("loading tile", width / 2, height / 2 + 10);
}

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

const initializeMap = (htmlId: string, seed: string): L.map => {
    seed = Math.random() < 0.5 ? "V-BAD-C-433189014-0-0-0" : "M-BAD-C-147910338-0-0-0" // TODO: remove this hardcoded test seed
    // TODO: activeSeedsRef
    if (mapsRef.value.has(seed)) {
        return mapsRef.value.get(seed)!.getMap();
    }
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

    const leafletMap = L.map(htmlId, { crs: MapsNotIncludedCRS, minZoom: -5, maxZoom: 20, zoomSnap: 0 }).setView([0, 0], 4);

    const PlaceholderLayer = L.TileLayer.extend({
        getTileUrl(_coords: TileCoords): string {
            return "/mode_nominal_256.png";
        },
        getAttribution(): string {
            return "Klei Entertainment, Maps Not Included";
        }
    });

    (L.tileLayer as any).placeholderLayer = (opts?: L.TileLayerOptions) => new PlaceholderLayer(opts);
    (L.tileLayer as any).placeholderLayer().addTo(leafletMap);

    const MyCanvasLayer = L.GridLayer.extend({
        initialize: function(seed: string, options: L.GridLayerOptions) {
            this._mni_seed = seed;
            L.setOptions(this, options);
        },
        createTile: function (coords: TileCoords, done: (error: any | null, tile: HTMLCanvasElement) => void): HTMLDivElement {
            let tileWrapper = document.createElement("div");
            const tile = document.createElement("canvas");
            tileWrapper.appendChild(tile);
            const size = this.getTileSize();
            tile.width = size.x;
            tile.height = size.y; // TODO: test if this is correct on Retina displays

            /*
            Not ideal to create error tiles for all tiles even if only one will be used, but Leaflet seems to expect
            all DOM nodes to be created in advance
             */
            const errorTile = document.createElement("canvas");
            errorTile.width = size.x;
            errorTile.height = size.y;
            tileWrapper.appendChild(errorTile);
            errorTile.style.display = "none";
            const errorCtx = errorTile.getContext("2d")!;

            const createErrorTile = (err: any) => {
                console.log("Failed to create tile", err, tile);
                errorCtx.drawImage(tile, 0, 0);
                drawErrorOverlay(errorCtx, size.x, size.y);
                tile.style.display = "none";
                errorTile.style.display = "";
                errorTile.style.visibility = "visible";
                done(err, errorTile);
            }

            try {

                const leafletMap = this._map as L.Map;
                const seed = this._mni_seed;
                // TODO: tile layer that says Error on it
                if (seed === null) {
                    console.error("Seed is null");
                    done(new Error("Seed is null"), tile);
                    return tileWrapper;
                }
                if (typeof seed !== "string") {
                    console.error("Seed is not a string");
                    done(new Error("Seed is not a string"), tile);
                    return tileWrapper;
                }

                initializeWebGL().then(async () => setupLeafletMap(leafletMap, seed, htmlId).then(async () => {
                    const startTime = DEBUG_TILE_TIMING ? performance.now() : 0;

                    const canvasSize = get_map_units_per_cell_from_zoom(coords.z);
                    const xyScale = get_cells_per_zoom_0_map_tile_from_zoom(coords.z);
                    const xOffset = -1 * coords.x * xyScale;
                    const yOffset = (coords.y + 1) * xyScale - (numCellsWorldHeight.value ?? 0);

                    const [_, bitmap] = await webGLCanvas.value!.sequence()
                        .render(
                            seed,
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
                        createErrorTile(err);
                        done(err as Error, tile);
                    }
                }));
            } catch (err) {
                createErrorTile(err);
            }

            return tileWrapper;
        },
        getAttribution(): string {
            return "Klei Entertainment, Maps Not Included";
        }
    });


    (L.gridLayer as any).myCanvasLayer = (opts?: L.GridLayerOptions) => new MyCanvasLayer(seed, opts);
    (L.gridLayer as any).myCanvasLayer().addTo(leafletMap);

    L.control.scale().addTo(leafletMap);

    // add more units to the Leaflet scale
    // TODO: make this a local property of a map, not a global Leaflet property
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
    // insert newly made map into maps
    mapsRef.value.set(htmlId, new LeafletMapData(leafletMap));
    return leafletMap;
}
export const resizeMap = (htmlId: string): void => {
    if (!mapsRef.value.has(htmlId)) {
        console.error(`Map container with htmlId ${htmlId} not found.`);
        throw new Error(`Map container with htmlId ${htmlId} not found.`);
    }
    const mapInstance = mapsRef.value.get(htmlId)!.getMap();
    mapInstance.invalidateSize();
}
export const removeMap = (htmlId: string): void => {
    if (!mapsRef.value.has(htmlId)) {
        console.error(`Map container with htmlId ${htmlId} not found. Only call removeMap() for cleanup.`);
        throw new Error(`Map container with htmlId ${htmlId} not found. Only call removeMap() for cleanup.`);
    }
    const mapInstance = mapsRef.value.get(htmlId)!.getMap();
    mapInstance.off();
    mapInstance.remove();
    mapsRef.value.delete(htmlId);
}

export { initializeMap, mapsRef };