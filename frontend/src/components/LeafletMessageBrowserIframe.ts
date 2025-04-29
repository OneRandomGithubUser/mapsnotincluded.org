import {Ref, ref} from "vue"

import "leaflet/dist/leaflet.css";
import * as L from "leaflet";

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

/**
 * Syncs the Leaflet map position to the data from the iframe via postMessage.
 */
export function useLeafletMapSync(
    iframeRef: Ref<HTMLIFrameElement | null>,
    mapSizesRef: Ref<Map<string, MapSize>>,
    LeafletWebGL2Map: Ref<L.map>,
    clippingWrapperId = "map-clipping-wrapper-1",
    mapContainerId = "map-container-1"
) {
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

                const mapClippingWrapper = document.getElementById(clippingWrapperId)
                if (mapClippingWrapper) {
                    mapClippingWrapper.style.visibility = isVisible ? "visible" : "hidden"
                }

                if (!mapContainers || mapContainers.length === 0) return

                const { left: visLeft, top: visTop, right: visRight, bottom: visBottom } = visibleScrollBounds[0]
                const { left, top, right, bottom, seed } = mapContainers[0]

                const coordKey = seed
                const mapDiv = document.getElementById(mapContainerId)
                if (!mapDiv || !mapClippingWrapper) {
                    console.warn(`Missing map elements for ${mapContainerId} or ${clippingWrapperId}`)
                    return
                }

                const mapWidth = right - left
                const mapHeight = bottom - top
                const offsetLeft = left - visLeft
                const offsetTop = top - visTop
                const visWidth = visRight - visLeft
                const visHeight = visBottom - visTop

                // Position and size the wrapper (clipping area)
                mapClippingWrapper.style.left = `${visLeft}px`
                mapClippingWrapper.style.top = `${visTop}px`
                mapClippingWrapper.style.width = `${visWidth}px`
                mapClippingWrapper.style.height = `${visHeight}px`

                // Position and size the inner map
                mapDiv.style.left = `${offsetLeft}px`
                mapDiv.style.top = `${offsetTop}px`
                mapDiv.style.width = `${mapWidth}px`
                mapDiv.style.height = `${mapHeight}px`

                // Check if map size changed
                const mapSizes = mapSizesRef.value
                const prev = mapSizes.get(coordKey)
                const hasSizeChanged = !prev || prev.mapWidth !== mapWidth || prev.mapHeight !== mapHeight

                if (hasSizeChanged) {
                    mapSizes.set(coordKey, { mapWidth, mapHeight })
                    LeafletWebGL2Map.value.invalidateSize()
                }
            } catch (err) {
                console.error("Failed to parse or apply leafletBoxes data", err)
            }
        }
    })
}
