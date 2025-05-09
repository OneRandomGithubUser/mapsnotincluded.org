import {Ref, ref} from "vue"

import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import {LeafletWebGL2Map} from "@/components/LeafletWebGL2Map";
import {createError} from "@/components/CreateCascadingError";
import {DomEvent} from "leaflet";
import stopPropagation = DomEvent.stopPropagation;

type LeafletBoxBounds = {
    left: number
    top: number
    right: number
    bottom: number
    seed: string
    index: number
}

type VisibleScrollBounds = {
    left: number
    top: number
    right: number
    bottom: number
}

type MapSize = {
    mapWidth: number
    mapHeight: number
}

class MapData {
    public mapSize: MapSize;
    public leafletBoxBounds: LeafletBoxBounds;
    constructor(mapSize: MapSize, leafletBoxBounds: LeafletBoxBounds) {
        this.mapSize = mapSize;
        this.leafletBoxBounds = leafletBoxBounds;
    }
}

interface LeafletBoxesMessage {
    type: "leafletBoxes"
    boxesJson: string
}

/**
 * Syncs the Leaflet map position to the data from the iframe via postMessage.
 */
export class LeafletMessageBrowserIframe {
    private readonly DEBUG_PRINT_FORWARDED_INTERACTION_EVENTS = false;

    private readonly iframe: HTMLIFrameElement;
    private readonly leafletWebGl2Map: LeafletWebGL2Map;
    private readonly mapData: Map<string, MapData>;
    private readonly mapClippingWrapper: HTMLDivElement;
    private animationFrameId: number;
    private readonly controller: AbortController;
    private visibleScrollBounds: VisibleScrollBounds[];
    private isVisible: boolean;

    constructor(iframe: HTMLIFrameElement, mapClippingWrapper: HTMLDivElement, leafletWebGl2Map: LeafletWebGL2Map) {
        this.iframe = iframe;
        this.mapData = new Map<string, MapData>();
        this.mapClippingWrapper = mapClippingWrapper;
        this.leafletWebGl2Map = leafletWebGl2Map;
        this.controller = new AbortController();
        this.visibleScrollBounds = [];
        this.isVisible = false;

        this.animationFrameId = requestAnimationFrame(this.requestLeafletBoxes.bind(this));

        window.addEventListener("message", (event: MessageEvent<LeafletBoxesMessage>) => {
                if (event.data?.type === "leafletBoxes") {
                    this.parseLeafletBoxesData(event);
                }
            },
            { signal: this.controller.signal }
        )
        window.addEventListener("message", (event: MessageEvent<any>) => {
            if (typeof event.data?.type === "string" && event.data.type.startsWith("iframe:")) {
                this.handleIframeEvent(event.data);
            }
        }, { signal: this.controller.signal });

    }

    public remove() {
        cancelAnimationFrame(this.animationFrameId);
        this.controller.abort();
    }

    // Fake wheel event to the Leaflet map. Workaround for the iframe not receiving wheel events.
    // TODO: possibly move the map code to the iframe to avoid this issue
    // TODO: if not, fake pointer events to the iframe too
    private handleIframeEvent(data: {
        type: string;
        clientX: number;
        clientY: number;
        [key: string]: any;
    }) {
        const { type, clientX, clientY } = data;

        for (const [seed, mapData] of this.mapData.entries()) {
            const { left, top, right, bottom } = mapData.leafletBoxBounds;

            // TODO: this manual dispatch event calculating the Leaflet map position might not work on Retina displays, should be tested
            if (clientX >= left && clientX <= right && clientY >= top && clientY <= bottom) {
                const mapDivId = this.getLeafletMapId(seed);
                const mapDiv = document.getElementById(mapDivId);
                if (!mapDiv) {
                    console.warn(`Map DOM not found for seed ${seed}`);
                    return;
                }

                const nativeType = type.replace(/^iframe:/, "");

                let event: Event;

                if (nativeType === "wheel") {
                    event = new WheelEvent(nativeType, {
                        bubbles: true,
                        cancelable: true,
                        clientX: data.clientX,
                        clientY: data.clientY,
                        deltaX: data.deltaX ?? 0,
                        deltaY: data.deltaY ?? 0,
                        deltaZ: data.deltaZ ?? 0,
                        deltaMode: data.deltaMode ?? 0,
                        ctrlKey: data.ctrlKey ?? false,
                        metaKey: data.metaKey ?? false,
                        shiftKey: data.shiftKey ?? false,
                        altKey: data.altKey ?? false
                    });
                } else if (nativeType.startsWith("pointer")) {
                    event = new PointerEvent(nativeType, data);
                } else if (nativeType.startsWith("mouse") || nativeType === "contextmenu" || nativeType === "click" || nativeType === "dblclick") {
                    event = new MouseEvent(nativeType, data);
                } else if (nativeType.startsWith("key")) {
                    event = new KeyboardEvent(nativeType, data);
                } else if (nativeType.startsWith("drag")) {
                    event = new DragEvent(nativeType, data);
                } else {
                    console.warn("Unhandled event type:", nativeType);
                    return;
                }

                mapDiv.dispatchEvent(event);
                if (this.DEBUG_PRINT_FORWARDED_INTERACTION_EVENTS) {
                    console.log(`Dispatched ${nativeType} to map ${seed}`);
                }

                // Fake a mouse event for pointer events
                // NOTE: hacky workaround for Leaflet not handling pointer events correctly
                if (nativeType === "pointerdown" || nativeType === "pointermove" || nativeType === "pointerup") {
                    // Get mouse event name from pointer event name
                    const mouseEventName = nativeType.replace("pointer", "mouse");
                    const syntheticMouseDown = new MouseEvent(mouseEventName, {
                        bubbles: true,
                        cancelable: true,
                        clientX: data.clientX,
                        clientY: data.clientY,
                        button: data.button,
                        buttons: data.buttons,
                        ctrlKey: data.ctrlKey,
                        metaKey: data.metaKey,
                        shiftKey: data.shiftKey,
                        altKey: data.altKey
                    });

                    mapDiv.dispatchEvent(syntheticMouseDown);
                    if (this.DEBUG_PRINT_FORWARDED_INTERACTION_EVENTS) {
                        console.log(`Dispatched synthetic mouse event to map ${seed}`);
                    }
                }

                // Fake a mouse over event for pointer events
                // NOTE: hacky workaround for Leaflet.GestureHandling not handling pointer events correctly
                if (nativeType === "pointermove") {
                    const syntheticMouseOver = new MouseEvent("mouseover", {
                        bubbles: true,
                        cancelable: true,
                        clientX: data.clientX,
                        clientY: data.clientY,
                        button: data.button,
                        buttons: data.buttons,
                        ctrlKey: data.ctrlKey,
                        metaKey: data.metaKey,
                        shiftKey: data.shiftKey,
                        altKey: data.altKey
                    });

                    mapDiv.dispatchEvent(syntheticMouseOver);
                    if (this.DEBUG_PRINT_FORWARDED_INTERACTION_EVENTS) {
                        console.log(`Dispatched synthetic mouse event to map ${seed}`);
                    }
                }
                return;
            }
        }
    }

    private parseLeafletBoxesData(event: MessageEvent<LeafletBoxesMessage>) {
        try {
            const boxes = JSON.parse(event.data.boxesJson);

            // TODO: remove this debug code
            const debugPredefinedSeeds = [
                "SWMP-C-1827596172-0-0-0",
                "M-BAD-C-687529253-0-0-0",
                "V-OASIS-C-1888383654-0-0-F33",
                "invalid-seed-test",
                null,
                "M-BAD-C-687529253-0-0-0 - duplicate and whitespace test",
                "M-BAD-C-687529253-0-0-0-missing-elementIdx8",
                "M-BAD-C-687529253-0-0-0-missing-mass32",
                "M-BAD-C-687529253-0-0-0-missing-temperature32"
            ]
            const mapContainers: LeafletBoxBounds[] = boxes["map-containers"].map((box: LeafletBoxBounds) => ({
                ...box,
                seed: debugPredefinedSeeds[box.index - 1] ?? null
            }));
            // const mapContainers: LeafletBoxBounds[] = boxes["map-containers"];

            const visibleScrollBounds: VisibleScrollBounds[] = boxes["visible-scroll-bounds"];
            this.visibleScrollBounds = visibleScrollBounds;
            const isVisible: boolean = boxes["visible"];
            this.isVisible = isVisible;

            if (!visibleScrollBounds || visibleScrollBounds.length === 0) {
                return;
            }

            const mapClippingWrapper = this.mapClippingWrapper;
            mapClippingWrapper.style.visibility = isVisible ? "visible" : "hidden";
            const newSeeds = new Set<string>(mapContainers.map(m => m.seed));
            const activeSeeds = new Set<string>(this.mapData.keys());

            // TODO: check if this is needed
            if (!this.areSetsEqual(newSeeds, activeSeeds)) {
                // window.parent.postMessage({ type: "seed-change", seedList: mapContainers.map(m => m.seed) }, "*");
                // lastSeeds = newSeeds;
                this.changeMapDom(mapClippingWrapper, newSeeds, activeSeeds); // TODO: class to sync maps, with an action on add, change, and remove?
                // activeSeeds = newSeeds;
            }

            const { left: visLeft, top: visTop, right: visRight, bottom: visBottom } = visibleScrollBounds[0]; // for now, assume there is only one visible scroll bounds
            for (const mapContainer of mapContainers) {
                const {left, top, right, bottom, seed, index} = mapContainer;

                const coordKey = seed; // TODO: remove testing code
                const mapContainerId = this.getMapContainerId(coordKey);
                const mapDiv = document.getElementById(mapContainerId);
                if (!mapDiv) {
                    throw this.createError(`Missing map elements for ${mapContainerId}`);
                }

                const mapWidth = right - left;
                const mapHeight = bottom - top;
                const offsetLeft = left - visLeft;
                const offsetTop = top - visTop;
                const visWidth = visRight - visLeft;
                const visHeight = visBottom - visTop;

                // Position and size the wrapper (clipping area)
                mapClippingWrapper.style.left = `${visLeft}px`;
                mapClippingWrapper.style.top = `${visTop}px`;
                mapClippingWrapper.style.width = `${visWidth}px`;
                mapClippingWrapper.style.height = `${visHeight}px`;

                // Position and size the inner map
                mapDiv.style.left = `${offsetLeft}px`;
                mapDiv.style.top = `${offsetTop}px`;
                mapDiv.style.width = `${mapWidth}px`;
                mapDiv.style.height = `${mapHeight}px`;

                // Check if map size changed
                const mapData = this.mapData;
                const prev = mapData.get(coordKey);
                if (prev === undefined) {
                    mapData.set(coordKey, new MapData({mapWidth, mapHeight}, mapContainer));
                }
                const hasSizeChanged = !prev || prev.mapSize.mapWidth !== mapWidth || prev.mapSize.mapHeight !== mapHeight;

                const curr = mapData.get(coordKey);
                if (curr === undefined) {
                    throw this.createError(`Missing map data for ${coordKey}`);
                }
                curr.leafletBoxBounds = mapContainer;
                if (hasSizeChanged) {
                    curr.mapSize = {mapWidth, mapHeight};
                    const leafletMapId = this.getLeafletMapId(coordKey);
                    this.leafletWebGl2Map.resizeMap(leafletMapId);
                }
            }
            for (const seed of this.mapData.keys()) {
                if (!newSeeds.has(seed)) {
                    this.mapData.delete(seed);
                }
            }
        } catch (err) {
            throw this.createError("Failed to parse or apply leafletBoxes data", false, err);
        }
    }

    private getMapContainerId(seed: string) {
        return `map-container-${seed}`;
    }

    private getLeafletMapId(seed: string) {
        return `map-${seed}`;
    }

    private addMapDom(mapClippingWrapper: HTMLDivElement, seed: string) {
        const mapContainer = document.createElement("div");
        mapContainer.id = this.getMapContainerId(seed);
        mapContainer.className = "map-container";
        mapClippingWrapper.appendChild(mapContainer);
        const mapWrapper = document.createElement("div");
        mapWrapper.className = "map-wrapper";
        mapContainer.appendChild(mapWrapper);
        const mapHeader = document.createElement("div");
        mapHeader.className = "map-header";
        mapHeader.innerText = `Map of ${seed}`;
        mapWrapper.appendChild(mapHeader);
        const leafletMap = document.createElement("div");
        const leafletMapId = this.getLeafletMapId(seed);
        leafletMap.id = leafletMapId;
        leafletMap.className = "leaflet-map";
        mapWrapper.appendChild(leafletMap);
        const mapFooter = document.createElement("div");
        mapFooter.className = "map-footer";
        mapFooter.innerText = "⚠️ Experimental Feature ⚠️";
        mapWrapper.appendChild(mapFooter);

        this.leafletWebGl2Map.initializeMap(leafletMapId, seed);

        // LeafletWebGL2Map.value.createInstance(seed, `map-${seed}`); // new API TODO: check if this is needed
    }

    private removeMapDom(seed: string) {
        const mapContainerId = this.getMapContainerId(seed);
        const mapContainer = document.getElementById(mapContainerId);
        if (!mapContainer) {
            console.error(`Map container with id ${mapContainerId} not found`);
            throw new Error(`Map container with id ${mapContainerId} not found`);
        }
        mapContainer.remove(); // TODO: check that this is enough to remove everything
        const leafletMapId = this.getLeafletMapId(seed);
        this.leafletWebGl2Map.removeMap(leafletMapId);
        // LeafletWebGL2Map.value.destroyInstance(seed); // TODO: check if this is needed
    }

    private changeMapDom(mapClippingWrapper: HTMLDivElement, newSeeds: Set<string>, oldSeeds: Set<string>) {
        // add new maps
        for (const s of newSeeds) if (!oldSeeds.has(s)) this.addMapDom(mapClippingWrapper, s);
        // remove old maps
        for (const s of oldSeeds) if (!newSeeds.has(s)) this.removeMapDom(s);
    }

    private areSetsEqual = (setA: Set<string>, setB: Set<string>) => {
        if (setA.size !== setB.size) return false;
        for (const item of setA) {
            if (!setB.has(item)) return false;
        }
        return true;
    }

    private requestLeafletBoxes() {
        const iframe = this.iframe;
        if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage("getLeafletBoxes", "*");
        }
        this.animationFrameId = requestAnimationFrame(this.requestLeafletBoxes.bind(this));
    }

    private createError(msg: string, doConsoleLog: boolean = true, baseError?: unknown): Error {
        return createError("LeafletMessageBrowserIframe", msg, doConsoleLog, baseError);
    }
}