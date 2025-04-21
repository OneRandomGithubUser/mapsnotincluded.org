// @/components/WebGL2Proxy.ts
import WebGLWorker from "@/components/WebGL2WebWorker?worker";
import WebGL2CanvasManager from "./WebGL2_ts.js";

type Callback = () => void;

interface RenderArgs {
    worldWidth: number;
    worldHeight: number;
    width: number;
    height: number;
    xOffset: number;
    yOffset: number;
    canvasWidth: number;
    canvasHeight: number;
    onComplete: Callback;
}

interface IWebGL2AsyncManager {
    /**
     * Initializes the WebGL canvas with image assets.
     * Called once after OffscreenCanvas is set up.
     */
    setup(images: HTMLImageElement[], onComplete: () => void): void;

    /**
     * Triggers a render with the given parameters.
     * All coordinates are in logical or world space.
     */
    render(
        worldWidth: number,
        worldHeight: number,
        width: number,
        height: number,
        xOffset: number,
        yOffset: number,
        canvasWidth: number,
        canvasHeight: number,
        onComplete: () => void
    ): void;

    /**
     * Clears the canvas contents.
     */
    clearCanvas(): void;

    /**
     * Returns the current canvas content as an ImageBitmap.
     * Zero-copy transfer recommended for rendering/display use.
     */
    getImageBitmap(): Promise<ImageBitmap>;

    /**
     * Returns the current canvas content as a Blob.
     * Useful for saving or uploading.
     */
    getImageBlob(options?: ImageEncodeOptions): Promise<Blob>;
}


export default class WebGL2Proxy implements IWebGL2AsyncManager {
    private worker: Worker;
    private requestId = 0;
    private callbacks: Record<number, Callback | ((data: any) => void)> = {};

    constructor(canvas: OffscreenCanvas) {
        this.worker = new WebGLWorker();

        this.worker.onmessage = this.handleMessage.bind(this);

        this.post("init", { canvas: canvas }, [canvas]);
    }

    private post(type: string, payload: any, transfer: Transferable[] = []): number {
        const requestId = this.requestId++;
        this.worker.postMessage({ type, payload, requestId }, transfer);
        return requestId;
    }

    private handleMessage(event: MessageEvent) : void {
        const { type, requestId, data } = event.data;
        if (this.callbacks[requestId]) {
            this.callbacks[requestId](data);
            delete this.callbacks[requestId];
        }
    }

    setup(images: HTMLImageElement[], onComplete: Callback) : void {
        const id = this.post("setup", { images });
        this.callbacks[id] = onComplete;
    }

    render(
        worldWidth: number,
        worldHeight: number,
        width: number,
        height: number,
        xOffset: number,
        yOffset: number,
        canvasWidth: number,
        canvasHeight: number,
        onComplete: Callback
    ) : void {
        const id = this.post("render", {
            args: [worldWidth, worldHeight, width, height, xOffset, yOffset, canvasWidth, canvasHeight]
        });
        this.callbacks[id] = onComplete;
    }

    clearCanvas() : void {
        this.post("clearCanvas", {});
    }

    getImageBlob(options: ImageEncodeOptions={ type: "image/webp" }): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const id = this.post("getImageArrayBuffer", {
                args: [options]
            });
            this.callbacks[id] = (buffer: ArrayBuffer) => {
                try {
                    const blob = new Blob([buffer], options); // or whatever format
                    resolve(blob);
                } catch (e) {
                    reject(e);
                }
            };
        });
    }

    getImageBitmap(): Promise<ImageBitmap> {
        return new Promise((resolve, reject) => {
            const id = this.post("getImageBitmap", {});
            this.callbacks[id] = (bitmap: ImageBitmap) => {
                resolve(bitmap);
            };
        });
    }



    /*
    getImage(): Promise<string> {
        return new Promise((resolve) => {
            const id = this.post("getImage", {});
            this.callbacks[id] = resolve;
        });
    }
     */
}
