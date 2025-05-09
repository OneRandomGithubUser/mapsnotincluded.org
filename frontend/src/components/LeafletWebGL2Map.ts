import WebGL2Proxy from "@/components/WebGL2WebWorkerProxy";
import {RenderLayer} from "@/components/MapData";
import {loadAndPad, loadBitmapsAsync, loadImagesAsync} from "@/components/LoadImage";
import {bitmapToBase64, canvasToBase64, imageToBase64} from "@/components/MediaToBase64";

import {onMounted, Ref, ref, watch} from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import 'leaflet.fullscreen';
import 'leaflet.fullscreen/Control.FullScreen.css';
import { GestureHandling } from "leaflet-gesture-handling";
import "leaflet-gesture-handling/dist/leaflet-gesture-handling.css";

import {createError} from "@/components/CreateCascadingError";
import {LeafletExpandedScaleControl} from "@/components/LeafletExpandedScaleControl";
import {LeafletLayerToggleControl} from "@/components/LeafletLayerToggleControl";

interface TileCoords {
    x: number;
    y: number;
    z: number;
}

type UploadUuid = string

type Url = string

class LeafletMapData {
    private map: L.Map;
    private isReadyToRender: boolean;
    private setupPromise: Map<RenderLayer, Promise<{numCellsWorldWidth: number, numCellsWorldHeight: number}> | null>;
    private numCellsWorldWidth: number | null;
    private numCellsWorldHeight: number | null;
    constructor(
        map: L.Map,
        numCellsWorldWidth: number | null = null,
        numCellsWorldHeight: number | null = null
    ) {
        this.map = map;
        this.isReadyToRender = false;
        this.setupPromise = new Map();
        this.numCellsWorldWidth = numCellsWorldWidth;
        this.numCellsWorldHeight = numCellsWorldHeight;
    }
    public getMap(): L.Map {
        return this.map;
    }
    public setMap(map: L.Map): void {
        this.map = map;
    }
    public getIsReadyToRender(): boolean {
        return this.isReadyToRender;
    }
    public setIsReadyToRender(isReadyToRender: boolean): void {
        this.isReadyToRender = isReadyToRender;
    }

    /*
     *  Promise<void> means there is a currently running setup
     *  null means the render layer is already set up
     *  undefined means the render layer is not set up yet
     */
    public getSetupPromise(renderLayer: RenderLayer): Promise<{numCellsWorldWidth: number, numCellsWorldHeight: number}> | null | undefined {
        const promise = this.setupPromise.get(renderLayer);
        return promise;
    }

    public setSetupPromise(renderLayer: RenderLayer, promise: Promise<{numCellsWorldWidth: number, numCellsWorldHeight: number}>): void {
        this.setupPromise.set(renderLayer, promise);
    }

    public clearSetupPromise(renderLayer: RenderLayer): void {
        this.setupPromise.set(renderLayer, null);
    }

    public setNumCellsWorldWidth(numCellsWorldWidth: number) {
        this.numCellsWorldWidth = numCellsWorldWidth;
    }
    public getNumCellsWorldWidth(): number | null {
        return this.numCellsWorldWidth;
    }

    public setNumCellsWorldHeight(numCellsWorldHeight: number) {
        this.numCellsWorldHeight = numCellsWorldHeight;
    }
    public getNumCellsWorldHeight(): number | null {
        return this.numCellsWorldHeight;
    }

    private createError(msg: string, doConsoleLog: Boolean = true, baseError?: unknown): Error {
        return createError("LeafletMapData", msg, doConsoleLog, baseError);
    }
}

export class LeafletWebGL2Map {
    private readonly DEBUG_DO_DRAW_OUTLINES = false;
    private readonly DEBUG_DO_PRINT_TILE_BASE_64 = false;
    private readonly DEBUG_DO_PRINT_TILE_TIMING = false; // enable/disable debug timings
    private readonly DEBUG_DO_PRINT_SETUP_TIMING = false; // enable/disable debug timings

    private readonly ZOOM_0_CELLS_PER_MAP_UNIT = 8; // Base tile size for the map - this is purposefully not 1 to make sure code accounts for this!!
    private readonly METERS_PER_CELL = 1;
    private readonly MAP_UNITS_PER_ZOOM_0_MAP_TILE = 256; // Leaflet default
    private readonly ZOOM_0_CELLS_PER_ZOOM_0_MAP_TILE = this.ZOOM_0_CELLS_PER_MAP_UNIT * this.MAP_UNITS_PER_ZOOM_0_MAP_TILE; // Make sure dimensional analysis checks out!!
    private readonly CELLS_PER_NATURAL_TEXTURE_TILE = 8; // Number of cells per texture tile, lengthwise
    private readonly MAX_LOSSLESS_MAP_UNITS_PER_CELL = 128; // Maximum size per cell
    private readonly MAX_LOSSLESS_ZOOM = this.get_zoom_from_map_units_per_cell(this.MAX_LOSSLESS_MAP_UNITS_PER_CELL); // Maximum zoom level for lossless tiles

    private readonly mapData: Map<UploadUuid, LeafletMapData> = new Map();
    private readonly webGLCanvasRef: Ref<WebGL2Proxy | null> = ref(null);
    private readonly webGLInitPromiseRef: Ref<Promise<void> | null> = ref(null);

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

            const timings: DOMHighResTimeStamp[] = [];
            timings.push(performance.now());

            console.log("Initializing WebGL2");
            console.log("  Initializing canvas manager");
            const canvasManager = new WebGL2Proxy();
            await canvasManager.init();
            this.webGLCanvasRef.value = canvasManager;

            timings.push(performance.now());
            console.log(`  Initialized canvas manager (${(timings[timings.length - 1] - timings[timings.length - 2]).toFixed(3)} ms)`);
            console.log(`  Setting up canvas manager`);
            console.log(`    Creating initial image URLs`);

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

            timings.push(performance.now());
            console.log(`    Created initial image URLs (${(timings[timings.length - 1] - timings[timings.length - 2]).toFixed(3)} ms)`);
            console.log(`    Sending image URLs to canvas manager for loading`);

            await canvasManager.sequence().setup({
                elementDataImage: elementDataImage.urls[0],
                bgImages: bgImages.urls,
                tileImages: tileImages.urls,
            }).exec();

            timings.push(performance.now());
            console.log(`    Sent images URLs to canvas manager and loaded (${(timings[timings.length - 1] - timings[timings.length - 2]).toFixed(3)} ms)`);

            console.log(`Created canvas manager! (${(timings[timings.length - 1] - timings[0]).toFixed(3)} ms)`);
            /*
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

    public resizeMap(uploadUuid: UploadUuid): void {
        if (!this.mapData.has(uploadUuid)) {
            const msg = `Map container with uploadUuid ${uploadUuid} not found.`;
            throw this.createError(`Map container with uploadUuid ${uploadUuid} not found.`, true);
        }
        const mapInstance = this.mapData.get(uploadUuid)!.getMap();
        mapInstance.invalidateSize();
    }
    public removeMap(uploadUuid: UploadUuid): void {
        const mapData = this.mapData.get(uploadUuid);
        if (mapData === undefined) {
            const msg = `Map container with uploadUuid ${uploadUuid} not found. Only call removeMap() for cleanup.`;
            throw this.createError(msg, true);
        }
        const mapInstance = mapData.getMap();
        mapInstance.off();
        const deletedMapInstance = mapInstance.remove();
        mapData.setMap(deletedMapInstance);
        this.mapData.delete(uploadUuid);
    }
    public removeAllMaps(): void {
        for (const [uploadUuid, mapData] of this.mapData.entries()) {
            const mapInstance = mapData.getMap();
            mapInstance.off();
            const deletedMapInstance = mapInstance.remove();
            mapData.setMap(deletedMapInstance);
            // this.mapData.delete(uploadUuid); // TODO: fix
        }
        for (const [uploadUuid, mapData] of this.mapData.entries()) {
            console.log("Removing mapData.getMap()", mapData.getMap());
            this.mapData.delete(uploadUuid);
        }
    }

    private async setupLeafletMap(
        leafletMap: L.Map,
        seed: string,
        uploadUuid: UploadUuid,
        dataImageBaseUrl: Url,
        renderLayer: RenderLayer
    ): Promise<void> {
        const leafletMapData = this.mapData.get(uploadUuid);
        if (!leafletMapData) {
            throw this.createError(`Map container with uploadUuid ${uploadUuid} not found.`);
        }
        // NOTE: this assumes that, if a layer is set up, the map (but not necessarily other layers) is also set up

        // TODO: fix race conditions with leafletMapData with atomics or mutex

        const existingPromise = leafletMapData.getSetupPromise(renderLayer);

        // This layer already set up?
        if (existingPromise === null) {
            // This layer hasn't been evicted by the LRU cache?
            const canvasManagerIsReadyArr = await this.webGLCanvasRef.value!.sequence().getIsReadyToRender(seed, renderLayer).exec(); // TODO: await needed?
            const canvasManagerIsReady = !canvasManagerIsReadyArr.includes(false);
            if (canvasManagerIsReady) console.log(`Canvas manager is already ready for seed=${seed} in setupLeafletMap()`);
            if (canvasManagerIsReady) {
                return;
            }
        }

        // This layer already being set up?
        if (existingPromise) {
            await existingPromise;
            return;
        }

        const timings: DOMHighResTimeStamp[] = [];
        if (this.DEBUG_DO_PRINT_SETUP_TIMING) {
            timings.push(performance.now());
            console.log(`  Setting up data image for seed=${seed} in setupLeafletMap()`);
        }

        // First caller - begin setup (existingPromise is undefined)
        const setup: Promise<void> = (async () => {
            /*
            * TODO: Make it so it's ok if the local state thinks the canvas is ready but the canvas manager isn't, since we wait
            * but there should not be a situation where the canvas manager thinks it's ready but the local state doesn't, unless there is a very narrow race condition
            */
            // Make sure canvas manager agrees with local state before starting
            // Until the TO DO is done, this will account for multiple layers being setup by the same data images
            const canvasManagerIsReadyArr = await this.webGLCanvasRef.value!.sequence().getIsReadyToRender(seed, renderLayer).exec();
            const canvasManagerIsReady = !canvasManagerIsReadyArr.includes(false);
            if (canvasManagerIsReady) {
                // TODO: should this throw an error? or return? No need to reupload images if still cached in the canvas manager

                const msg = `Tried to double set up a currently ready canvas manager for seed=${seed} in setupLeafletMap()`;
                console.warn(msg);
                // throw this.createError(msg, true);

                // leafletMapData.clearSetupPromise(renderLayer);
                // return;
            }


            const base = `/world_data/${dataImageBaseUrl}`;
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

            if (this.DEBUG_DO_PRINT_SETUP_TIMING) {
                timings.push(performance.now());
                console.log(`  Set up data image for seed=${seed} in setupLeafletMap() (${(timings[timings.length - 1] - timings[timings.length - 2]).toFixed(3)} ms)`);
            }

            // Don't set up the leaflet map itself if already setup
            if (leafletMapData.getIsReadyToRender()) {
                leafletMapData.clearSetupPromise(renderLayer);
                return;
            }

            if (this.DEBUG_DO_PRINT_SETUP_TIMING) {
                console.log(`  Setting up Leaflet map for seed=${seed} in setupLeafletMap()`);
            }

            const numCellsWorldWidth = bitmaps[0].width;
            const numCellsWorldHeight = bitmaps[0].height;

            leafletMapData.setNumCellsWorldWidth(numCellsWorldWidth);
            leafletMapData.setNumCellsWorldHeight(numCellsWorldHeight);

            const numMapUnitsWorldWidth = numCellsWorldWidth / this.ZOOM_0_CELLS_PER_MAP_UNIT;
            const numMapUnitsWorldHeight = numCellsWorldHeight / this.ZOOM_0_CELLS_PER_MAP_UNIT;
            const NUM_WORLD_DISTANCES_BEYOND_BOUNDS = 2;

            const bounds: L.LatLngBoundsExpression = [
                [
                    -NUM_WORLD_DISTANCES_BEYOND_BOUNDS * numMapUnitsWorldHeight,
                    -NUM_WORLD_DISTANCES_BEYOND_BOUNDS * numMapUnitsWorldWidth,
                ],
                [
                    (1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldHeight,
                    (1 + NUM_WORLD_DISTANCES_BEYOND_BOUNDS) * numMapUnitsWorldWidth,
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

            if (this.DEBUG_DO_PRINT_SETUP_TIMING) {
                timings.push(performance.now());
                console.log(`  Set up Leaflet map for seed=${seed} in setupLeafletMap() (${(timings[timings.length - 1] - timings[timings.length - 2]).toFixed(3)} ms)`);
            }
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

    public initializeMap(leafletDomId: string, seed: string, uploadUuid: UploadUuid, dataImageBaseUrl: Url): L.Map {
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

        const mapElement = document.getElementById(leafletDomId);
        if (!mapElement) {
            const msg = `Map container with leafletDomId ${leafletDomId} not found.`;
            throw this.createError(msg, true); //
        }
        const LEAFLET_MAP_MIN_ZOOM = -100; // -5;
        const LEAFLET_MAP_MAX_ZOOM = 100; // 20;
        L.Map.addInitHook("addHandler", "gestureHandling", GestureHandling);
        const leafletMap = L.map(mapElement, {
            crs: MapsNotIncludedCRS,
            minZoom: LEAFLET_MAP_MIN_ZOOM,
            maxZoom: LEAFLET_MAP_MAX_ZOOM,
            zoomSnap: 0,
            fullscreenControl: true,
            gestureHandling: false // NOTE: do not set this to true! https://github.com/elmarquis/Leaflet.GestureHandling/issues/31#issuecomment-520782104
        }).setView([0, 0], 4);

        // enable gesture handling AFTER initialization due to bug with Leaflet.GestureHandling
        // see https://github.com/elmarquis/Leaflet.GestureHandling/issues/31#issuecomment-520782104
        const gestureHandler = (leafletMap as any).gestureHandling;
        (leafletMap as any).gestureHandling.enable();

        const addFullscreenHintText = (leafletMap: L.Map) => {
            const container = leafletMap.getContainer();

            // Get existing i18n scroll message set by Leaflet.GestureHandling
            const originalScrollMsg = container.getAttribute("data-gesture-handling-scroll-content") ?? "";
            const originalTouchMsg = container.getAttribute("data-gesture-handling-touch-content") ?? "";

            // Append custom note (add spacing or separator as needed)
            const customNote = " - or enter fullscreen"; // TODO: readd this when entering and exiting fullscreen
            container.setAttribute("data-gesture-handling-scroll-content", originalScrollMsg + customNote);
            container.setAttribute("data-gesture-handling-touch-content", originalTouchMsg + customNote);
        }

        // Add hint to use fullscreen to not have to use ctrl+zoom
        leafletMap.whenReady(() => {
            addFullscreenHintText(leafletMap);
        });

        // disable Leaflet.GestureHandling when in fullscreen
        leafletMap.on('enterFullscreen', () => {
            const gestureHandler = (leafletMap as any).gestureHandling;
            mapElement.style.pointerEvents = "auto";
            gestureHandler.disable();
        });
        leafletMap.on('exitFullscreen', () => {
            gestureHandler.enable();
            mapElement.style.pointerEvents = "none";
            addFullscreenHintText(leafletMap);
        });

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

                    this._mni_leafletWebGL2Map.initializeWebGL().then(async () => this._mni_leafletWebGL2Map.setupLeafletMap(leafletMap, seed, uploadUuid, dataImageBaseUrl, this._mni_renderLayer).then(async () => {
                        const leafletMapData = this._mni_leafletWebGL2Map.mapData.get(uploadUuid);
                        const numCellsWorldWidth = leafletMapData.getNumCellsWorldWidth();
                        if (numCellsWorldWidth === null) {
                            const msg = `numCellsWorldWidth is null for seed=${seed} in createTile(). Please initialize it before retrieving it.`;
                            return createAndSendErrorTile(this._mni_leafletWebGL2Map.createError(msg), tile, errorCtx);
                        }
                        const numCellsWorldHeight = leafletMapData.getNumCellsWorldHeight();
                        if (numCellsWorldHeight === null) {
                            const msg = `numCellsWorldHeight is null for seed=${seed} in createTile(). Please initialize it before retrieving it.`;
                            return createAndSendErrorTile(this._mni_leafletWebGL2Map.createError(msg), tile, errorCtx);
                        }
                        const startTime = this._mni_leafletWebGL2Map.DEBUG_DO_PRINT_TILE_TIMING ? performance.now() : 0;

                        const canvasSize = this._mni_leafletWebGL2Map.get_map_units_per_cell_from_zoom(coords.z);
                        const xyScale = this._mni_leafletWebGL2Map.get_cells_per_zoom_0_map_tile_from_zoom(coords.z);
                        const xOffset = -1 * coords.x * xyScale;
                        const yOffset = (coords.y + 1) * xyScale - (numCellsWorldHeight ?? 0);

                        let bitmap: ImageBitmap;
                        try {
                            const [_, bmp] = await this._mni_leafletWebGL2Map.webGLCanvasRef.value!.sequence()
                                .render(
                                    seed,
                                    numCellsWorldWidth,
                                    numCellsWorldHeight,
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

                            if (this._mni_leafletWebGL2Map.DEBUG_DO_DRAW_OUTLINES) {
                                const ctx = tile.getContext("2d")!;
                                ctx.drawImage(bitmap, 0, 0);
                                this._mni_leafletWebGL2Map.drawDebugInfo(ctx, coords, size.x, size.y);
                            } else {
                                const ctx = tile.getContext("bitmaprenderer")!;
                                ctx.transferFromImageBitmap(bitmap);
                            }

                            if (this._mni_leafletWebGL2Map.DEBUG_DO_PRINT_TILE_BASE_64) {
                                canvasToBase64(tile).then(base64 => {
                                    console.log(`Tile (${coords.x},${coords.y},${coords.z}) base64:`, base64);
                                });
                            }

                            if (this._mni_leafletWebGL2Map.DEBUG_DO_PRINT_TILE_TIMING) {
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

        // Add the layer switcher control
        const layers = {
            element: { layer: elementOverlayLayer, icon: "🔬", label: "Element",
                soundOnSelectUrl: "/layer_sounds/SG_HUD_techView_suit_v02.wav",
                soundOnDeselectUrl: "/layer_sounds/SG_HUD_techView_off_long.wav" },
            temperature: { layer: temperatureOverlayLayer, icon: "🌡️", label: "Temperature",
                soundOnSelectUrl: "/layer_sounds/SG_HUD_techView_temperature_v02.wav",
                soundOnDeselectUrl: "/layer_sounds/SG_HUD_techView_off_long.wav" },
            mass: { layer: massOverlayLayer, icon: "🧱", label: "Mass",
                soundOnSelectUrl: "/layer_sounds/SG_HUD_techView_oxygen_v02.wav",
                soundOnDeselectUrl: "/layer_sounds/SG_HUD_techView_off_long.wav" },
        };

        const toggleControl = new LeafletLayerToggleControl({
            position: 'topright',
            className: 'custom-layer-toggle',
            layers
        });

        leafletMap.addControl(toggleControl);

        // Add a scale control with more units
        const leafletExpandedScaleControl = new LeafletExpandedScaleControl({
            metric: true,
            imperial: true,
            updateWhenIdle: true
        });
        leafletExpandedScaleControl.addTo(leafletMap);

        // insert newly made map into maps
        this.mapData.set(uploadUuid, new LeafletMapData(leafletMap));
        return leafletMap;
    }
}