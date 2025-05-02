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

class LeafletMapData {
    private map: L.Map;
    private isReadyToRender: boolean;
    private setupPromise: Promise<void> | null;
    constructor(
        map: L.Map
    ) {
        this.map = map;
        this.isReadyToRender = false;
        this.setupPromise = null;
    }
    getMap(): L.Map {
        return this.map;
    }
    setMap(map: L.Map): void {
        this.map = map;
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

export class LeafletWebGL2Map {
    private readonly DEBUG_OUTLINES = false;
    private readonly DEBUG_URL_PRINT = false;
    private readonly DEBUG_TILE_TIMING = false; // enable/disable debug timings

    private readonly ZOOM_0_CELLS_PER_MAP_UNIT = 8; // Base tile size for the map - this is purposefully not 1 to make sure code accounts for this!!
    private readonly METERS_PER_CELL = 1;
    private readonly MAP_UNITS_PER_ZOOM_0_MAP_TILE = 256; // Leaflet default
    private readonly ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE = this.ZOOM_0_CELLS_PER_MAP_UNIT * this.MAP_UNITS_PER_ZOOM_0_MAP_TILE; // Make sure dimensional analysis checks out!!
    private readonly CELLS_PER_NATURAL_TEXTURE_TILE = 8; // Number of cells per texture tile, lengthwise
    private readonly MAX_LOSSLESS_MAP_UNITS_PER_CELL = 128; // Maximum size per cell
    private readonly MAX_LOSSLESS_ZOOM = this.get_zoom_from_map_units_per_cell(this.MAX_LOSSLESS_MAP_UNITS_PER_CELL); // Maximum zoom level for lossless tiles

    private readonly mapData: Map<string, LeafletMapData> = new Map();
    private readonly webGLCanvasRef: Ref<WebGL2Proxy | null> = ref(null);
    private readonly webGLInitPromiseRef: Ref<Promise<void> | null> = ref(null);
    private readonly numCellsWorldWidthRef: Ref<number | null> = ref(null);
    private readonly numCellsWorldHeightRef: Ref<number | null> = ref(null);

    constructor() {
        //
    }

    private createError(msg: string, doConsoleLog: Boolean = false, baseError?: unknown): Error {
        const prefixedMsg = `[LeafletWebGL2Map] ❌ ${msg}`;
        const errorOptions = baseError ? {cause: baseError} : undefined;
        if (doConsoleLog) {
            console.error(prefixedMsg, baseError);
        }
        return new Error(prefixedMsg, errorOptions);
    }

    private initializeWebGL(): Promise<void> {
    if (this.webGLInitPromiseRef.value) {
        return this.webGLInitPromiseRef.value;
    }

    this.webGLInitPromiseRef.value = new Promise(async (resolve, reject) => { try {

        console.log("Initializing canvas manager");
        const canvasManager = new WebGL2Proxy();
        this.webGLCanvasRef.value = canvasManager;

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
            images: HTMLImageElement[],
            bitmaps: ImageBitmap[]
        } = {
            "urls": [
                "/space_00.png",
                "/space_01.png",
            ],
            "images": [],
            "bitmaps": []
        }
        const elementDataImage: {
            urls: string[],
            images: HTMLImageElement[],
            bitmaps: ImageBitmap[]
        } = {
            "urls": [
                "/element_data_1x1.png"
            ],
            "images": [],
            "bitmaps": []
        }
        const tileImages: {
            urls: string[],
            images: HTMLImageElement[],
            bitmaps: ImageBitmap[]
        } = {
            "urls": [],
            "images": [],
            "bitmaps": []
        }

        for (let tileSize = NATURAL_TILES_TEXTURE_SIZE; tileSize >= 1; tileSize /= 2) {
            tileImages.urls.push(`/tiles_mipmaps/${tileSize}x${tileSize}.png`);
        }

        for (const imageData of [bgImages, elementDataImage, tileImages]) {
            // TODO: batch async operations together better without awaiting for each one
            const {successes, failures} = await loadImagesAsync(imageData.urls);
            imageData.images = successes.map(success => success.image);
            try {
                imageData.bitmaps = await Promise.all(imageData.images.map(img => createImageBitmap(img)));
            } catch (err: unknown) {
                const msg = `Failed to create bitmaps from images for ${imageData.urls} in initializeWebGL()`;
                throw this.createError(msg, true, err);
            }
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
        resolve();
    } catch (err: unknown) {
        const msg = "❌ Failed to initialize WebGL2 canvas manager in initializeWebGL()";
        console.error(msg, err);
        reject({reason: msg, error: err});
    }});

    return this.webGLInitPromiseRef.value;
    };

    private static drawErrorOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
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

    private static drawDebugInfo = (ctx: CanvasRenderingContext2D, coords: TileCoords, width: number, height: number): void => {
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

    private get_map_units_per_cell_from_zoom(zoom: number): number {
        return 2 ** zoom;
    }

    private get_cells_per_zoom_0_map_tile_from_zoom(zoom: number): number {
        return this.ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE / this.get_map_units_per_cell_from_zoom(zoom);
    }

    private get_bounded_zoom(zoom: number): number {
        return Math.min(this.MAX_LOSSLESS_ZOOM, zoom);
    }

    private get_zoom_from_map_units_per_cell(size: number): number {
        return Math.log2(size);
    }

    public resizeMap(htmlId: string): void {
        if (!this.mapData.has(htmlId)) {
            const msg = `Map container with htmlId ${htmlId} not found.`;
            throw this.createError(`Map container with htmlId ${htmlId} not found.`, true);
        }
        const mapInstance = this.mapData.get(htmlId)!.getMap();
        mapInstance.invalidateSize();
    }
    public removeMap(htmlId: string): void {
        const mapData = this.mapData.get(htmlId);
        if (mapData === undefined) {
            const msg = `Map container with htmlId ${htmlId} not found. Only call removeMap() for cleanup.`;
            throw this.createError(msg, true);
        }
        const mapInstance = mapData.getMap();
        mapInstance.off();
        const deletedMapInstance = mapInstance.remove();
        mapData.setMap(deletedMapInstance);
        this.mapData.delete(htmlId);
    }
    public removeAllMaps(): void {
        for (const [htmlId, mapData] of this.mapData.entries()) {
            const mapInstance = mapData.getMap();
            mapInstance.off();
            const deletedMapInstance = mapInstance.remove();
            mapData.setMap(deletedMapInstance);
            // this.mapData.delete(htmlId); // TODO: fix
        }
        for (const [htmlId, mapData] of this.mapData.entries()) {
            console.log("mapData.getMap()", mapData.getMap());
            this.mapData.delete(htmlId);
        }
    }

    private async setupLeafletMap(
        leafletMap: L.Map,
        seed: string,
        htmlId: string
    ): Promise<void> {
        const leafletMapData = this.mapData.get(htmlId);
        if (!leafletMapData) {
            throw this.createError(`Map container with htmlId ${htmlId} not found.`);
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

            let bitmaps: ImageBitmap[];
            try {
                bitmaps = await Promise.all(urls.map(u => loadAndPad(u, 1200, 500)));
            } catch (err: unknown) {
                const msg = `Failed to load/pad images for seed=${seed} in setupLeafletMap()`;
                throw this.createError(msg, true, err);
            }

            try {
                await this.webGLCanvasRef.value!.sequence().setup({ dataImages: bitmaps, seed }).exec();
            } catch (err: unknown) {
                const msg = `❌ WebGL setup failed for seed=${seed} in setupLeafletMap()`;
                throw this.createError(msg, true, err);
            }


            const numCellsWorldWidth = bitmaps[0].width;
            const numCellsWorldHeight = bitmaps[0].height;

            this.numCellsWorldWidthRef.value = numCellsWorldWidth;
            this.numCellsWorldHeightRef.value = numCellsWorldHeight;

            const numMapUnitsWorldWidth = numCellsWorldWidth / this.ZOOM_0_CELLS_PER_MAP_UNIT;
            const numMapUnitsWorldHeight = numCellsWorldHeight / this.ZOOM_0_CELLS_PER_MAP_UNIT;
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
            const worldCenterX = numCellsWorldWidth / 2 / this.ZOOM_0_CELLS_PER_MAP_UNIT;
            const worldCenterY = -numCellsWorldHeight / 2 / this.ZOOM_0_CELLS_PER_MAP_UNIT;
            leafletMap.setView([worldCenterY, worldCenterX], 4);

            leafletMapData.setIsReadyToRender(true);
            leafletMapData.clearSetupPromise();
        })();

        leafletMapData.setSetupPromise(setup);

        try {
            await setup;
        } catch (err: unknown) {
            const msg = `Failed to set up Leaflet map for seed=${seed} in setupLeafletMap()`;
            leafletMapData.clearSetupPromise(); // allow retry
            throw this.createError(msg, false, err);
        }
    }

    public initializeMap(htmlId: string, seed: string): L.Map {
        // TODO: activeSeedsRef
        if (this.mapData.has(seed)) {
            return this.mapData.get(seed)!.getMap();
        }
        const MapsNotIncludedCRS: L.CRS = L.extend({}, L.CRS.Simple, {
            distance: (latlng1: L.LatLngExpression, latlng2: L.LatLngExpression): number => {
                const l1 = L.latLng(latlng1);
                const l2 = L.latLng(latlng2);

                const dx = l2.lng - l1.lng;
                const dy = l2.lat - l1.lat;
                const mapUnitsDistance = Math.sqrt(dx * dx + dy * dy);

                const METERS_PER_MAP_UNIT = this.ZOOM_0_CELLS_PER_MAP_UNIT * this.METERS_PER_CELL;
                return mapUnitsDistance * METERS_PER_MAP_UNIT;
            }
        });

        const mapElement = document.getElementById(htmlId);
        if (!mapElement) {
            const msg = `Map container with htmlId ${htmlId} not found.`;
            throw this.createError(msg, true); //
        }
        const leafletMap = L.map(mapElement, { crs: MapsNotIncludedCRS, minZoom: -5, maxZoom: 20, zoomSnap: 0 }).setView([0, 0], 4);

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
            initialize: function(seed: string, leafletWebGL2Map: LeafletWebGL2Map, options: L.GridLayerOptions) {
                this._mni_seed = seed;
                this._mni_leafletWebGL2Map = leafletWebGL2Map;
                L.setOptions(this, options);
            },
            createTile: function (coords: TileCoords, done: (error: unknown, tile: HTMLCanvasElement) => void): HTMLDivElement {
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

                const createAndSendErrorTile = (err: any, tile: HTMLCanvasElement, errorCtx: CanvasRenderingContext2D): HTMLCanvasElement => {
                    // TODO: is this the best way to log errors in the console?
                    console.error("Failed to create tile", err, tile);
                    errorCtx.drawImage(tile, 0, 0);
                    LeafletWebGL2Map.drawErrorOverlay(errorCtx, size.x, size.y);
                    tile.style.display = "none";
                    const errorTile = errorCtx.canvas;
                    errorTile.style.display = "";
                    errorTile.style.visibility = "visible";
                    done(err, errorTile);
                    return errorTile;
                }

                try {

                    const leafletMap = this._map as L.Map;
                    const seed = this._mni_seed;
                    // TODO: tile layer that says Error on it
                    if (seed === null) {
                        const msg = "Seed is null";
                        done(this._mni_leafletWebGL2Map.createError(msg, true), tile);
                        return tileWrapper;
                    }
                    if (typeof seed !== "string") {
                        const msg = "Seed is not a string";
                        done(this._mni_leafletWebGL2Map.createError(msg, true), tile);
                        return tileWrapper;
                    }

                    this._mni_leafletWebGL2Map.initializeWebGL().then(async () => this._mni_leafletWebGL2Map.setupLeafletMap(leafletMap, seed, htmlId).then(async () => {
                        const startTime = this._mni_leafletWebGL2Map.DEBUG_TILE_TIMING ? performance.now() : 0;

                        const numCellsWorldWidth = this._mni_leafletWebGL2Map.numCellsWorldWidthRef.value;
                        const numCellsWorldHeight = this._mni_leafletWebGL2Map.numCellsWorldHeightRef.value;
                        if (numCellsWorldWidth === null || numCellsWorldHeight === null) {
                            const msg = `numCellsWorldWidth or numCellsWorldHeight is null for seed=${seed} in createTile()`;
                            return createAndSendErrorTile(this._mni_leafletWebGL2Map.createError(msg), tile, errorCtx);
                        }

                        const canvasSize = this._mni_leafletWebGL2Map.get_map_units_per_cell_from_zoom(coords.z);
                        const xyScale = this._mni_leafletWebGL2Map.get_cells_per_zoom_0_map_tile_from_zoom(coords.z);
                        const xOffset = -1 * coords.x * xyScale;
                        const yOffset = (coords.y + 1) * xyScale - (numCellsWorldHeight ?? 0);

                        let bitmap: ImageBitmap;
                        try {
                            const [_, bmp] = await this._mni_leafletWebGL2Map.webGLCanvasRef.value!.sequence()
                                .render(
                                    seed,
                                    this._mni_leafletWebGL2Map.numCellsWorldWidthRef.value!,
                                    this._mni_leafletWebGL2Map.numCellsWorldHeightRef.value!,
                                    xyScale, xyScale,
                                    xOffset, yOffset,
                                    size.x, size.y
                                ).transferImageBitmap()
                                .exec();
                            bitmap = bmp;
                        } catch (err: unknown) {
                            const msg = `WebGL setup failed for seed=${seed} in createTile()`;
                            return createAndSendErrorTile(this._mni_leafletWebGL2Map.createError(msg, false, err), tile, errorCtx);
                        }

                        try {

                            if (this._mni_leafletWebGL2Map.DEBUG_OUTLINES) {
                                const ctx = tile.getContext("2d")!;
                                ctx.drawImage(bitmap, 0, 0);
                                this._mni_leafletWebGL2Map.drawDebugInfo(ctx, coords, size.x, size.y);
                            } else {
                                const ctx = tile.getContext("bitmaprenderer")!;
                                ctx.transferFromImageBitmap(bitmap);
                            }

                            if (this._mni_leafletWebGL2Map.DEBUG_URL_PRINT) {
                                canvasToBase64(tile).then(base64 => {
                                    console.log(`Tile (${coords.x},${coords.y},${coords.z}) base64:`, base64);
                                });
                            }

                            if (this._mni_leafletWebGL2Map.DEBUG_TILE_TIMING) {
                                const endTime = performance.now();
                                console.log(`Tile (${coords.x},${coords.y},${coords.z}) rendered in ${(endTime - startTime).toFixed(2)} ms`);
                            }

                            done(null, tile);
                        } catch (err: unknown) {
                            const msg = `Failed to get canvas image bitmap for seed=${seed} in createTile()`;
                            createAndSendErrorTile(this._mni_leafletWebGL2Map.createError(msg, false, err), tile, errorCtx);
                        }
                    })).catch((err: unknown) => {
                        const msg = `Failed to initialize WebGL for seed=${seed} in createTile()`;
                        createAndSendErrorTile(this._mni_leafletWebGL2Map.createError(msg, false, err), tile, errorCtx);
                    });
                } catch (err: unknown) {
                    const msg = `Failed to create tile for seed=${seed} in createTile()`;
                    createAndSendErrorTile(this._mni_leafletWebGL2Map.createError(msg, false, err), tile, errorCtx);
                }

                return tileWrapper;
            },
            getAttribution(): string {
                return "Klei Entertainment, Maps Not Included";
            }
        });


        (L.gridLayer as any).myCanvasLayer = (opts?: L.GridLayerOptions) => new MyCanvasLayer(seed, this, opts);
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
                const thou = inches * 1000;
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
                    let m = this._getRoundNum(thou);
                    label = m + ' thou'; // "mils" is ambiguous
                    ratio = m / thou;
                }

                this._updateScale(this._iScale, label, ratio);
            }

        });
        // insert newly made map into maps
        this.mapData.set(htmlId, new LeafletMapData(leafletMap));
        return leafletMap;
    }
}