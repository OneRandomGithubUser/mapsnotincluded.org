import WebGL2Proxy from "@/components/WebGL2WebWorkerProxy";
import {RenderLayer} from "@/components/MapData";
import {loadAndPad, loadImagesAsync} from "@/components/LoadImage";
import {bitmapToBase64, canvasToBase64, imageToBase64} from "@/components/MediaToBase64";

import {onMounted, Ref, ref, watch} from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import 'leaflet.fullscreen';
import 'leaflet.fullscreen/Control.FullScreen.css';

import {createError} from "@/components/CreateCascadingError";

interface TileCoords {
    x: number;
    y: number;
    z: number;
}

class LeafletMapData {
    private map: L.Map;
    private isReadyToRender: boolean;
    private setupPromise: Map<RenderLayer, Promise<void> | null>;
    constructor(
        map: L.Map
    ) {
        this.map = map;
        this.isReadyToRender = false;
        this.setupPromise = new Map();
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

    // Promise<void> means there is a currently running setup
    // null means the render layer is already set up
    // undefined means the render layer is not set up yet
    getSetupPromise(renderLayer: RenderLayer): Promise<void> | null | undefined {
        const promise = this.setupPromise.get(renderLayer);
        return promise;
    }

    setSetupPromise(renderLayer: RenderLayer, promise: Promise<void>): void {
        this.setupPromise.set(renderLayer, promise);
    }

    clearSetupPromise(renderLayer: RenderLayer): void {
        this.setupPromise.set(renderLayer, null);
    }

    createError(msg: string, doConsoleLog: Boolean = true, baseError?: unknown): Error {
        return createError("LeafletMapData", msg, doConsoleLog, baseError);
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

    private createError(msg: string, doConsoleLog: Boolean = true, baseError?: unknown): Error {
        return createError("LeafletWebGL2Map", msg, doConsoleLog, baseError);
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
        console.log("  Loading initial images");

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
        const msg = "Failed to initialize WebGL2 canvas manager in initializeWebGL()";
        console.error(msg, err);
        reject({reason: msg, error: err});
    }});

    return this.webGLInitPromiseRef.value;
    };

    /**
     * Draws a labeled overlay on the canvas with optional border and multiple lines of styled text.
     */
    private static drawTextOverlay = (
        ctx: CanvasRenderingContext2D,
        width: number,
        height: number,
        lines: string[],
        options?: {
            strokeColor?: string;
            fillColor?: string;
            backgroundColor?: string;
            borderColor?: string;
            borderWidth?: number;
            font?: string;
            lineHeight?: number;
        }
    ): void => {
        const {
            strokeColor = "white",
            fillColor = "red",
            backgroundColor = null,
            borderColor = "red",
            borderWidth = 4,
            font = "bold 16px Arial",
            lineHeight = 24
        } = options || {};

        // Optional background fill
        if (backgroundColor) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }

        // Border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(0, 0, width, height);

        // Text setup
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const centerX = width / 2;
        const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

        for (let i = 0; i < lines.length; i++) {
            const y = startY + i * lineHeight;

            ctx.strokeStyle = strokeColor;
            ctx.strokeText(lines[i], centerX, y);

            ctx.fillStyle = fillColor;
            ctx.fillText(lines[i], centerX, y);
        }
    };


    private static drawErrorOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
        LeafletWebGL2Map.drawTextOverlay(ctx, width, height, [
            "ERROR",
            "in loading tile",
            "Please try again or notify us!"
        ]);
    }

    private static drawDebugInfo = (ctx: CanvasRenderingContext2D, coords: TileCoords, width: number, height: number): void => {
        LeafletWebGL2Map.drawTextOverlay(ctx, width, height, [
            `(${coords.x}, ${coords.y}, ${coords.z})`,
            `${width} × ${height} px`
        ]);
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
            console.log("Removing mapData.getMap()", mapData.getMap());
            this.mapData.delete(htmlId);
        }
    }

    private async setupLeafletMap(
        leafletMap: L.Map,
        seed: string,
        htmlId: string,
        renderLayer: RenderLayer
    ): Promise<void> {
        const leafletMapData = this.mapData.get(htmlId);
        if (!leafletMapData) {
            throw this.createError(`Map container with htmlId ${htmlId} not found.`);
        }
        // NOTE: this assumes that, if a layer is set up, the map (but not necessarily other layers) is also set up

        // TODO: fix race conditions with leafletMapData with atomics or mutex

        const existingPromise = leafletMapData.getSetupPromise(renderLayer);

        // This layer already set up?
        // TODO: think carefully about when to assume unique seeds, html id, version numbers, etc.
        if (existingPromise === null) {
            return;
        }

        // This layer already being set up?
        if (existingPromise) {
            await existingPromise;
            return;
        }

        console.log(`Setting up leaflet map for seed=${seed} in setupLeafletMap()`);

        // First caller - begin setup (existingPromise is undefined)
        const setup = (async () => {
            /*
            * TODO: Make it so it's ok if the local state thinks the canvas is ready but the canvas manager isn't, since we wait
            * but there should not be a situation where the canvas manager thinks it's ready but the local state doesn't, unless there is a very narrow race condition
            */
            // Make sure canvas manager agrees with local state before starting
            // Until the TO DO is done, this will account for multiple layers being setup by the same data images
            const canvasManagerIsReadyArr = await this.webGLCanvasRef.value!.sequence().getIsReadyToRender(seed, renderLayer).exec();
            const canvasManagerIsReady = !canvasManagerIsReadyArr.includes(false);
            if (canvasManagerIsReady) {
                // const msg = `Tried to double set up a currently ready canvas manager for seed=${seed} in setupLeafletMap()`;
                // throw this.createError(msg, true);
                leafletMapData.clearSetupPromise(renderLayer);
                return;
            }


            const base = `/world_data/${seed}`;
            const urls: string[] = [];
            // TODO: image versioning
            switch (renderLayer) {
                case RenderLayer.ELEMENT_BACKGROUND:
                    urls.push(`${base}/elementIdx8.png`);
                    break;
                case RenderLayer.ELEMENT_OVERLAY:
                    urls.push(`${base}/elementIdx8.png`);
                    break;
                case RenderLayer.TEMPERATURE_OVERLAY:
                    urls.push(`${base}/temperature32.png`);
                    break;
                case RenderLayer.MASS_OVERLAY:
                    urls.push(`${base}/mass32.png`);
                    break;
                default:
                    throw this.createError(`Unknown render layer ${renderLayer} in setupLeafletMap()`);
            }

            let bitmaps: ImageBitmap[];
            try {
                // TODO: move this to LoadImage.ts
                const {successes, failures} = await loadImagesAsync(urls);
                const images = successes.map(success => success.image);
                try {
                    bitmaps = await Promise.all(images.map(img => createImageBitmap(img, {
                        premultiplyAlpha: "none",
                        colorSpaceConversion: "none"
                    })));
                } catch (err: unknown) {
                    const msg = `Failed to create bitmaps from images for ${urls} in initializeWebGL()`;
                    throw this.createError(msg, true, err);
                }
                //bitmaps = await Promise.all(urls.map(u => loadAndPad(u, 1200, 500)));
            } catch (err: unknown) {
                const msg = `Failed to load/pad images for seed=${seed} in setupLeafletMap()`;
                throw this.createError(msg, true, err);
            }

            try {
                let bitmapMap = new Map<RenderLayer, ImageBitmap[]>();
                // TODO: make this less hacky and more flexible to noncontiguous layers, if necessary
                // use a switch statement in case we need to add more layers in the future
                switch (renderLayer) {
                    case RenderLayer.ELEMENT_BACKGROUND:
                        bitmapMap.set(RenderLayer.ELEMENT_BACKGROUND, bitmaps);
                        break;
                    case RenderLayer.ELEMENT_OVERLAY:
                        bitmapMap.set(RenderLayer.ELEMENT_OVERLAY, bitmaps);
                        break;
                    case RenderLayer.TEMPERATURE_OVERLAY:
                        bitmapMap.set(RenderLayer.TEMPERATURE_OVERLAY, bitmaps);
                        break;
                    case RenderLayer.MASS_OVERLAY:
                        bitmapMap.set(RenderLayer.MASS_OVERLAY, bitmaps);
                        break;
                    default:
                        throw this.createError(`Unknown render layer ${renderLayer} in setupLeafletMap()`);
                }
                await this.webGLCanvasRef.value!.sequence().setup({ dataImages: bitmapMap, seed }).exec();
            } catch (err: unknown) {
                const msg = `WebGL setup failed for seed=${seed} in setupLeafletMap()`;
                throw this.createError(msg, true, err);
            }

            // Don't set up the leaflet map itself if already setup
            if (leafletMapData.getIsReadyToRender()) {
                leafletMapData.clearSetupPromise(renderLayer);
                return;
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

            leafletMapData.setIsReadyToRender(true);
            leafletMap.setMaxBounds(bounds);

            // Get screen size (in pixels)
            const mapPixelSize = leafletMap.getSize(); // L.Point with x (width), y (height)

            // Calculate scale factor to fit the world within the screen
            const scaleX = mapPixelSize.x / numMapUnitsWorldWidth;
            const scaleY = mapPixelSize.y / numMapUnitsWorldHeight;
            const scale = Math.min(scaleX, scaleY); // fit both dimensions

            // Convert scale to zoom level
            const idealZoom = Math.log2(scale); // because each zoom level doubles resolution
            const boundedZoom = this.get_bounded_zoom(idealZoom);

            const worldCenterX = numCellsWorldWidth / 2 / this.ZOOM_0_CELLS_PER_MAP_UNIT;
            const worldCenterY = -numCellsWorldHeight / 2 / this.ZOOM_0_CELLS_PER_MAP_UNIT;
            const mapView: { center: L.LatLng, zoom: number } = {
                center: L.latLng([worldCenterY, worldCenterX]),
                zoom: boundedZoom,
            }
            leafletMap.setView(mapView.center, mapView.zoom);

            const HomeControl = L.Control.extend({
                options: {
                    position: 'topleft' // top-left, top-right, bottom-left, bottom-right
                },

                onAdd: function (map: L.Map) {
                    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');

                    container.innerHTML = '🗺️'; // TODO: 🏠
                    container.style.backgroundColor = 'white';
                    container.style.width = '30px';
                    container.style.height = '30px';
                    container.style.lineHeight = '30px';
                    container.style.textAlign = 'center';
                    container.style.cursor = 'pointer';

                    // Prevent clicks from propagating to the map
                    L.DomEvent.disableClickPropagation(container);

                    container.onclick = function () {
                        map.setView(mapView.center, mapView.zoom);
                    };

                    return container;
                }
            });
            leafletMap.addControl(new HomeControl());


            leafletMapData.clearSetupPromise(renderLayer);
        })();

        leafletMapData.setSetupPromise(renderLayer, setup);

        try {
            await setup;
        } catch (err: unknown) {
            const msg = `Failed to set up Leaflet map for seed=${seed} in setupLeafletMap()`;
            leafletMapData.clearSetupPromise(renderLayer); // allow retry
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
        const LEAFLET_MAP_MIN_ZOOM = -100; // -5;
        const LEAFLET_MAP_MAX_ZOOM = 100; // 20;
        const leafletMap = L.map(mapElement, {
            crs: MapsNotIncludedCRS,
            minZoom: LEAFLET_MAP_MIN_ZOOM,
            maxZoom: LEAFLET_MAP_MAX_ZOOM,
            zoomSnap: 0,
            fullscreenControl: true
        }).setView([0, 0], 4);

        const PlaceholderLayer = L.TileLayer.extend({
            createTile: function (coords: L.Coords, done: (error: unknown, tile: HTMLImageElement) => void): HTMLImageElement {
                const tile = document.createElement("img");

                // Required by Leaflet: set dimensions before loading
                tile.width = this.getTileSize().x;
                tile.height = this.getTileSize().y;

                // Delay loading the tile source
                setTimeout(() => {
                    tile.src = this.getTileUrl(coords);
                }, 1000); // 1000 ms (1 second) delay

                tile.onload = () => done(null, tile);
                tile.onerror = (err) => done(err, tile);

                return tile;
            },
            getTileUrl(coords: L.Coords): string {
                return "/mode_nominal_256.png"; // your placeholder image
            },
            getAttribution(): string {
                return "Klei Entertainment, Maps Not Included";
            }
        });

        (L.tileLayer as any).placeholderLayer = (opts?: L.TileLayerOptions) => new PlaceholderLayer(opts);
        (L.tileLayer as any).placeholderLayer().addTo(leafletMap);

        const MyCanvasLayer = L.GridLayer.extend({
            initialize: function(seed: string, leafletWebGL2Map: LeafletWebGL2Map, renderLayer: RenderLayer, options: L.GridLayerOptions) {
                this._mni_seed = seed;
                this._mni_leafletWebGL2Map = leafletWebGL2Map;
                this._mni_renderLayer = renderLayer;
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

                    this._mni_leafletWebGL2Map.initializeWebGL().then(async () => this._mni_leafletWebGL2Map.setupLeafletMap(leafletMap, seed, htmlId, this._mni_renderLayer).then(async () => {
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
                                    size.x, size.y,
                                    this._mni_renderLayer
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


        (L.gridLayer as any).myCanvasLayer = (layerIndex: RenderLayer, opts?: L.GridLayerOptions) => new MyCanvasLayer(seed, this, layerIndex, opts);
        const elementBackgroundLayer = (L.gridLayer as any).myCanvasLayer(RenderLayer.ELEMENT_BACKGROUND, {
            minZoom: LEAFLET_MAP_MIN_ZOOM,
            maxZoom: LEAFLET_MAP_MAX_ZOOM
        }); // ElementIdx
        const elementOverlayLayer = (L.gridLayer as any).myCanvasLayer(RenderLayer.ELEMENT_OVERLAY, {
            minZoom: LEAFLET_MAP_MIN_ZOOM,
            maxZoom: LEAFLET_MAP_MAX_ZOOM,
            opacity: 0.8
        }); // Temperature
        const temperatureOverlayLayer = (L.gridLayer as any).myCanvasLayer(RenderLayer.TEMPERATURE_OVERLAY, {
            minZoom: LEAFLET_MAP_MIN_ZOOM,
            maxZoom: LEAFLET_MAP_MAX_ZOOM,
            opacity: 0.8
        }); // Temperature
        const massOverlayLayer = (L.gridLayer as any).myCanvasLayer(RenderLayer.MASS_OVERLAY, {
            minZoom: LEAFLET_MAP_MIN_ZOOM,
            maxZoom: LEAFLET_MAP_MAX_ZOOM,
            opacity: 0.8
        }); // Mass

        // Set initial layer
        elementBackgroundLayer.addTo(leafletMap);

        // Add the layer switcher control\
        // TODO: maybe switch this to a Vue component?
        const LayerToggleControl = L.Control.extend({
            options: {
                position: 'topright'
            },

            onAdd: function (map: L.Map) {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                container.style.background = 'white';
                container.style.padding = '6px 8px';
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '6px';

                L.DomEvent.disableClickPropagation(container);

                const layers: Record<string, { layer: L.Layer; icon: string; label: string }> = {
                    "_mni_element_overlay_layer": {
                        layer: elementOverlayLayer,
                        icon: "🔬",
                        label: "Element"
                    },
                    "_mni_temperature_overlay_layer": {
                        layer: temperatureOverlayLayer,
                        icon: "🌡️",
                        label: "Temperature"
                    },
                    "_mni_mass_overlay_layer": {
                        layer: massOverlayLayer,
                        icon: "🧱",
                        label: "Mass"
                    }
                };

                let currentLayer: L.Layer | null = null;

                Object.entries(layers).forEach(([name, { layer, icon, label }]) => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.innerHTML = `${icon} ${label}`;
                    button.style.padding = "6px 12px";
                    button.style.font = "14px sans-serif";
                    button.style.cursor = "pointer";
                    button.style.border = "1px solid #ccc";
                    button.style.borderRadius = "4px";
                    button.style.background = "#f4f4f4";

                    const toggleActiveStyle = (active: boolean) => {
                        button.style.background = active ? "#0078ff" : "#f4f4f4";
                        button.style.color = active ? "#fff" : "#000";
                    };

                    toggleActiveStyle(false);

                    button.addEventListener("click", () => {
                        const isAlreadyActive = currentLayer === layer;
                        if (isAlreadyActive) {
                            map.removeLayer(layer);
                            currentLayer = null;
                            toggleActiveStyle(false);
                        } else {
                            if (currentLayer) {
                                map.removeLayer(currentLayer);
                                // Reset all button styles
                                [...container.querySelectorAll("button")].forEach(b => {
                                    (b as HTMLButtonElement).style.background = "#f4f4f4";
                                    (b as HTMLButtonElement).style.color = "#000";
                                });
                            }
                            map.addLayer(layer);
                            currentLayer = layer;
                            toggleActiveStyle(true);
                        }
                    });

                    container.appendChild(button);
                });

                return container;
            }
        });

        leafletMap.addControl(new LayerToggleControl());

        // Add a scale control
        L.control.scale().addTo(leafletMap);

        // add more units to the Leaflet scale
        // TODO: make this a local property of a map, not a global Leaflet property
        L.Control.Scale.include({
            // Let's have some fun and make absurdly small and large units
            // SI or IAU units
            _updateMetric: function (maxMeters: number) {
                let meters = this._getRoundNum(maxMeters);
                let astronomicalUnit = this._getRoundNum(maxMeters / 149597870700);
                let label = '';
                let ratio = 1;

                if (astronomicalUnit <= 1) {
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
                    } else if (maxMeters >= 1e-12) {
                        let pm = this._getRoundNum(maxMeters * 1e12);
                        label = pm + ' pm';
                        ratio = pm / 1e12 / maxMeters;
                    } else if (maxMeters >= 1e-15) {
                        let fm = this._getRoundNum(maxMeters * 1e15);
                        label = fm + ' fm';
                        ratio = fm / 1e15 / maxMeters;
                    } else if (maxMeters >= 1e-18) {
                        let am = this._getRoundNum(maxMeters * 1e18);
                        label = am + ' am';
                        ratio = am / 1e18 / maxMeters;
                    } else if (maxMeters >= 1e-21) {
                        let zm = this._getRoundNum(maxMeters * 1e21);
                        label = zm + ' zm';
                        ratio = zm / 1e21 / maxMeters;
                    } else if (maxMeters >= 1e-24) {
                        let ym = this._getRoundNum(maxMeters * 1e24);
                        label = ym + ' ym';
                        ratio = ym / 1e24 / maxMeters;
                    } else if (maxMeters >= 1e-27) {
                        let rm = this._getRoundNum(maxMeters * 1e27);
                        label = rm + ' rm';
                        ratio = rm / 1e27 / maxMeters;
                    } else if (maxMeters >= 1e-30) {
                        let qm = this._getRoundNum(maxMeters * 1e30);
                        label = qm + ' qm';
                        ratio = qm / 1e30 / maxMeters;
                    }
                } else {
                    let maxParsecs = maxMeters / 3.0857e16;
                    if (astronomicalUnit <= 1e3) {
                        let au = this._getRoundNum(astronomicalUnit);
                        label = au + ' au';
                        ratio = au / maxMeters;
                    } else if (maxParsecs <= 1) {
                        let kau = this._getRoundNum(maxParsecs * 1e3);
                        label = kau + ' kau';
                        ratio = kau / maxMeters;
                    } else if (maxParsecs <= 1e3) {
                        let parsec = this._getRoundNum(maxParsecs);
                        label = parsec + ' pc';
                        ratio = parsec / maxMeters;
                    } else if (maxParsecs <= 1e6) {
                        let kiloparsec = this._getRoundNum(maxParsecs / 1e3);
                        label = kiloparsec + ' kpc';
                        ratio = kiloparsec * 1e3 / maxMeters;
                    } else if (maxParsecs <= 1e9) {
                        let megaparsec = this._getRoundNum(maxParsecs / 1e6);
                        label = megaparsec + ' Mpc';
                        ratio = megaparsec * 1e6 / maxMeters;
                    } else if (maxParsecs <= 1e12) {
                        let gigaparsec = this._getRoundNum(maxParsecs / 1e9);
                        label = gigaparsec + ' Gpc';
                        ratio = gigaparsec * 1e9 / maxMeters;
                    } else {
                        let teraparsec = this._getRoundNum(maxParsecs / 1e12);
                        label = teraparsec + ' Tpc';
                        ratio = teraparsec * 1e12 / maxMeters;
                    }
                }

                this._updateScale(this._mScale, label, ratio);
            },

            _updateImperial: function (maxMeters: number) {
                const feet = maxMeters * 3.2808399;
                const inches = feet * 12;
                const thou = inches * 1000;
                const lightSecond = maxMeters / 299792458;
                const lightYear = lightSecond / (60 * 60 * 24 * 365.25); // Julian year
                let label = '';
                let ratio = 1;

                if (lightSecond < 1) {
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
                    } else if (thou >= 1) {
                        let m = this._getRoundNum(thou);
                        label = m + ' thou'; // "mils" is ambiguous
                        ratio = m / thou;
                    } else if (maxMeters >= 1e-10) {
                        let ang = this._getRoundNum(maxMeters * 1e10);
                        label = ang + ' Å';
                        ratio = ang / 1e10 / maxMeters;
                    } else if (maxMeters >= 1.0021e-13) {
                        let xu = this._getRoundNum(maxMeters / 1.0021e-13);
                        label = xu + ' xu';
                        ratio = xu * 1.0021e-13 / maxMeters;
                    } else if (maxMeters >= 2.817940285e-15) {
                        let electronRadii = this._getRoundNum(maxMeters / 2.817940285e-15);
                        label = electronRadii + ' rₑ';
                        ratio = electronRadii * 2.817940285e-15 / maxMeters;
                    } else {
                        let plankUnits = this._getRoundNum(maxMeters / 1.616199e-35);
                        label = plankUnits + ' 𝓁ₚ';
                        ratio = plankUnits * 1.616199e-35 / maxMeters;
                    }
                } else {
                    if (lightSecond <= 60) {
                        let lightSeconds = this._getRoundNum(lightSecond);
                        label = lightSeconds + ' ls';
                        ratio = lightSeconds / maxMeters;
                    } else if (lightSecond <= 60 * 60) {
                        let lightMinutes = this._getRoundNum(lightSecond / 60);
                        label = lightMinutes + ' lm';
                        ratio = lightMinutes * 60 / maxMeters;
                    } else if (lightSecond <= 60 * 60 * 24) {
                        let lightHours = this._getRoundNum(lightSecond / (60 * 60));
                        label = lightHours + ' lh';
                        ratio = lightHours * 60 * 60 / maxMeters;
                    } else if (lightYear <= 1) {
                        let lightDays = this._getRoundNum(lightSecond / (60 * 60 * 24));
                        label = lightDays + ' ld';
                        ratio = lightDays * 60 * 60 * 24 / maxMeters;
                    } else if (lightYear <= 1e3) {
                        let lightYears = this._getRoundNum(lightYear);
                        label = lightYears + ' ly';
                        ratio = lightYears / maxMeters;
                    } else if (lightYear <= 1e6) {
                        let kilolightYears = this._getRoundNum(lightYear / 1e3);
                        label = kilolightYears + ' kly';
                        ratio = kilolightYears * 1e3 / maxMeters;
                    } else if (lightYear <= 1e9) {
                        let megalightYears = this._getRoundNum(lightYear / 1e6);
                        label = megalightYears + ' Mly';
                        ratio = megalightYears * 1e6 / maxMeters;
                    } else if (lightYear <= 1e12) {
                        let gigalightYears = this._getRoundNum(lightYear / 1e9);
                        label = gigalightYears + ' Gly';
                        ratio = gigalightYears * 1e9 / maxMeters;
                    } else {
                        let teralightYears = this._getRoundNum(lightYear / 1e12);
                        label = teralightYears + ' Tly';
                        ratio = teralightYears * 1e12 / maxMeters;
                    }
                }

                this._updateScale(this._iScale, label, ratio);
            }

        });
        // insert newly made map into maps
        this.mapData.set(htmlId, new LeafletMapData(leafletMap));
        return leafletMap;
    }
}