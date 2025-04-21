// @/workers/webgl2.worker.ts
import WebGL2CanvasManager from "@/components/WebGL2";

// worker-global
let instance: WebGL2CanvasManager = null;

self.onmessage = async (event: MessageEvent) => {
    const { type, payload, requestId } = event.data;

    if (type === "init") {
        instance = new WebGL2CanvasManager(...payload.args);
        self.postMessage({ type: "init", requestId });
    } else if (type === "setup") {
        instance.setup(payload.images, () => {
            self.postMessage({ type: "setupComplete", requestId });
        });
    } else if (type === "render") {
        instance.render(...payload.args, () => {
            self.postMessage({ type: "renderComplete", requestId });
        });
    } else if (type === "clearCanvas") {
        instance.clearCanvas();
        self.postMessage({ type: "clearComplete", requestId });
    } else if (type === "copyImageArrayBuffer") {
        try {
            const arrayBuffer = await instance.copyImageArrayBuffer(...(payload?.args || []));
            self.postMessage(
                { type: "copyImageArrayBufferComplete", requestId, data: arrayBuffer },
                [arrayBuffer]
            );
        } catch (err) {
            self.postMessage({ type: "error", requestId, error: err.message });
            throw err;
        }
    } else if (type === "transferImageBitmap") {
        try {
            const bitmap = instance.transferImageBitmap();
            self.postMessage(
                { type: "transferImageBitmapComplete", requestId, data: bitmap },
                [bitmap]
            );
        } catch (err) {
            self.postMessage({ type: "error", requestId, error: err.message });
            throw err;
        }
    } else {
        const errorMessage = `Unknown message type received: "${type}"`;
        console.error(errorMessage);
        self.postMessage({
            type: "error",
            requestId,
            error: errorMessage,
        });
    }

    /* else if (type === "getImage") {
           const base64 = await instance.getImage(); // returns string
           console.log(base64);
           self.postMessage({ type: "imageData", data: base64, requestId });
       } */
};
export default {};