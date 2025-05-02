import {Ref, ref} from "vue"

import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import {LeafletWebGL2Map} from "@/components/LeafletWebGL2Map";

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

interface LeafletBoxesMessage {
    type: "leafletBoxes"
    boxesJson: string
}

/**
 * Syncs the Leaflet map position to the data from the iframe via postMessage.
 */
export class LeafletMessageBrowserIframe {
    private readonly iframe: HTMLIFrameElement;
    private readonly leafletWebGl2Map: LeafletWebGL2Map;
    private readonly mapData: Map<string, MapSize>;
    private readonly mapClippingWrapper: HTMLDivElement;
    private animationFrameId: number;
    private readonly controller: AbortController;

    constructor(iframe: HTMLIFrameElement, mapClippingWrapper: HTMLDivElement, leafletWebGl2Map: LeafletWebGL2Map) {
        this.iframe = iframe;
        this.mapData = new Map<string, MapSize>();
        this.mapClippingWrapper = mapClippingWrapper;
        this.leafletWebGl2Map = leafletWebGl2Map;
        this.controller = new AbortController();

        this.animationFrameId = requestAnimationFrame(this.requestLeafletBoxes.bind(this));

        window.addEventListener("message", (event: MessageEvent<LeafletBoxesMessage>) => {
                if (event.data?.type === "leafletBoxes") {
                    this.parseLeafletBoxesData(event);
                }
            },
            { signal: this.controller.signal }
        )
    }

    public remove() {
        cancelAnimationFrame(this.animationFrameId);
        this.controller.abort();
    }

    private parseLeafletBoxesData(event: MessageEvent<LeafletBoxesMessage>) {
        try {
            const boxes = JSON.parse(event.data.boxesJson);

            // TODO: remove this debug code
            const debugPredefinedSeeds = [
                "V-BAD-C-433189014-0-0-0",
                "invalid-seed-test",
                "M-BAD-C-147910338-0-0-0"
            ]
            const mapContainers: LeafletBoxBounds[] = boxes["map-containers"].map((box: LeafletBoxBounds) => ({
                ...box,
                seed: debugPredefinedSeeds[box.index - 1] ?? null
            }));
            // const mapContainers: LeafletBoxBounds[] = boxes["map-containers"];

            const visibleScrollBounds: VisibleScrollBounds[] = boxes["visible-scroll-bounds"];
            const isVisible: boolean = boxes["visible"];

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
                    console.error(`Missing map elements for ${mapContainerId}`);
                    return;
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
                const hasSizeChanged = !prev || prev.mapWidth !== mapWidth || prev.mapHeight !== mapHeight;

                if (hasSizeChanged) {
                    mapData.set(coordKey, {mapWidth, mapHeight});
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
            console.error("Failed to parse or apply leafletBoxes data", err)
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
}