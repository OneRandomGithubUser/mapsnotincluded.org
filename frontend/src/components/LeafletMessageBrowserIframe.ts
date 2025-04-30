import {Ref, ref} from "vue"

import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import {l} from "vite/dist/node/types.d-aGj9QkWt";
import {initializeMap, removeMap, resizeMap} from "@/components/LeafletWebGL2Map";

type LeafletBoxBounds = {
    left: number
    top: number
    right: number
    bottom: number
    seed: string
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

function getMapContainerId(seed: string) {
    return `map-container-${seed}`;
}

function getLeafletMapId(seed: string) {
    return `map-${seed}`;
}

/**
 * Syncs the Leaflet map position to the data from the iframe via postMessage.
 */
export function useLeafletMapSync(
    iframeRef: Ref<HTMLIFrameElement | null>,
    mapSizesRef: Ref<Map<string, MapSize>>,
    LeafletWebGL2MapsRef: Ref<Map<string,L.map>>,
    activeSeedsRef: Ref<Set<string>>,
    mapClippingWrapper: HTMLDivElement,
    clippingWrapperId = "map-clipping-wrapper-1"
) {
    function addMapDom(mapClippingWrapper: HTMLDivElement, seed: string) {
        const mapContainer = document.createElement("div");
        mapContainer.id = getMapContainerId(seed);
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
        const leafletMapId = getLeafletMapId(seed);
        leafletMap.id = leafletMapId;
        leafletMap.className = "leaflet-map";
        mapWrapper.appendChild(leafletMap);
        const mapFooter = document.createElement("div");
        mapFooter.className = "map-footer";
        mapFooter.innerText = "⚠️ Experimental Feature ⚠️";
        mapWrapper.appendChild(mapFooter);

        initializeMap(leafletMapId, seed);

        // LeafletWebGL2Map.value.createInstance(seed, `map-${seed}`); // new API TODO: check if this is needed
    }

    function removeMapDom(seed: string) {
        const mapContainerId = getMapContainerId(seed);
        const mapContainer = document.getElementById(mapContainerId);
        if (!mapContainer) {
            console.error(`Map container with id ${mapContainerId} not found`);
            throw new Error(`Map container with id ${mapContainerId} not found`);
            return;
        }
        mapContainer.remove(); // TODO: check that this is enough to remove everything
        const leafletMapId = getLeafletMapId(seed);
        removeMap(leafletMapId);
        // LeafletWebGL2Map.value.destroyInstance(seed); // TODO: check if this is needed
    }

    function changeMapDom(mapClippingWrapper: HTMLDivElement, newSeeds: Set<string>, oldSeeds: Set<string>) {
        // add new maps
        for (const s of newSeeds) if (!oldSeeds.has(s)) addMapDom(mapClippingWrapper, s);
        // remove old maps
        for (const s of oldSeeds) if (!newSeeds.has(s)) removeMapDom(s);
    }

    function onSeedChange(evt: MessageEvent) {
        if (evt.data?.type !== "seed-change") return;
        const newSeeds = new Set<string>(evt.data.seedList);
        // changeMapDom(mapClippingWrapper, newSeeds); // TODO: check if this is needed
        // activeSeedsRef.value = newSeeds; // TODO: check if this is needed
    }
    // window.addEventListener("message", onSeedChange); TODO: check if this is needed

    const areSetsEqual = (setA: Set<string>, setB: Set<string>) => {
        if (setA.size !== setB.size) return false;
        for (const item of setA) {
            if (!setB.has(item)) return false;
        }
        return true;
    }

    function requestLeafletBoxes() {
        const iframe = iframeRef.value
        if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage("getLeafletBoxes", "*")
        }
        requestAnimationFrame(requestLeafletBoxes)
    }

    requestAnimationFrame(requestLeafletBoxes)

    window.addEventListener("message", (event: MessageEvent<LeafletBoxesMessage>) => {
        if (event.data?.type === "leafletBoxes") {
            try {
                const boxes = JSON.parse(event.data.boxesJson)
                const mapContainers: LeafletBoxBounds[] = boxes["map-containers"]
                const visibleScrollBounds: VisibleScrollBounds = boxes["visible-scroll-bounds"]
                const isVisible: boolean = boxes["visible"]

                const mapClippingWrapper = document.getElementById(clippingWrapperId);
                if (!mapClippingWrapper) {
                    console.error(`Map clipping wrapper with id ${clippingWrapperId} not found`);
                    throw new Error(`Map clipping wrapper with id ${clippingWrapperId} not found`);
                }
                mapClippingWrapper.style.visibility = isVisible ? "visible" : "hidden";

                const newSeeds = new Set<string>(mapContainers.map(m => m.seed));
                const activeSeeds = activeSeedsRef.value;

                // TODO: check if this is needed
                if (!areSetsEqual(newSeeds, activeSeeds)) {
                    // window.parent.postMessage({ type: "seed-change", seedList: mapContainers.map(m => m.seed) }, "*");
                    // lastSeeds = newSeeds;
                    changeMapDom(mapClippingWrapper, newSeeds, activeSeeds);
                    activeSeedsRef.value = newSeeds;
                }

                if (!mapContainers || mapContainers.length === 0) return;

                const { left: visLeft, top: visTop, right: visRight, bottom: visBottom } = visibleScrollBounds[0]; // for now, assume there is only one visible scroll bounds
                for (const mapContainer of mapContainers) {
                    const {left, top, right, bottom, seed} = mapContainer;

                    const coordKey = seed;
                    const mapContainerId = getMapContainerId(coordKey);
                    const mapDiv = document.getElementById(mapContainerId);
                    if (!mapDiv || !mapClippingWrapper) {
                        console.error(`Missing map elements for ${mapContainerId} or ${clippingWrapperId}`);
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
                    const mapSizes = mapSizesRef.value;
                    const prev = mapSizes.get(coordKey);
                    const hasSizeChanged = !prev || prev.mapWidth !== mapWidth || prev.mapHeight !== mapHeight;

                    if (hasSizeChanged) {
                        mapSizes.set(coordKey, {mapWidth, mapHeight});
                        const leafletMapId = getLeafletMapId(coordKey);
                        resizeMap(leafletMapId);
                    }
                }
            } catch (err) {
                console.error("Failed to parse or apply leafletBoxes data", err)
            }
        }
    })
}