import _WebGL2Worker from "@/components/WebGL2WebWorker?worker";
import {RenderLayer} from "@/components/MapData";

interface Action {
    type: string;
    args?: any[];
}

interface Result {
    success: boolean;
    value?: any;
    error?: string;
}

// TODO: priority DAG of actions and callbacks, to accomodate things like cancelling actions and async callbacks
class SequenceBuilder<T extends any[] = []> {
    private actions: Action[] = [];

    constructor(private proxy: WebGL2Proxy) {}

    setup(...args: Parameters<WebGL2Proxy["setup"]>) {
        this.actions.push({ type: "setup", args });
        // unknown is needed, but even though the cast is safe (the types are controlled), TypeScript cannot prove it.
        return this as unknown as SequenceBuilder<[...T, void]>;
    }

    render(...args: Parameters<WebGL2Proxy["render"]>) {
        this.actions.push({ type: "render", args });
        // unknown is needed, but even though the cast is safe (the types are controlled), TypeScript cannot prove it.
        return this as unknown as SequenceBuilder<[...T, void]>;
    }

    getIsReadyToRender(...args: Parameters<WebGL2Proxy["getIsReadyToRender"]>) {
        this.actions.push({ type: "getIsReadyToRender", args });
        // unknown is needed, but even though the cast is safe (the types are controlled), TypeScript cannot prove it.
        return this as unknown as SequenceBuilder<[...T, boolean]>;
    }

    transferImageBitmap() {
        this.actions.push({ type: "transferImageBitmap" });
        // unknown is needed, but even though the cast is safe (the types are controlled), TypeScript cannot prove it.
        return this as unknown as SequenceBuilder<[...T, ImageBitmap]>;
    }

    copyImageBlob(options: ImageEncodeOptions = { type: "image/webp" }) {
        this.actions.push({ type: "copyImageArrayBuffer", args: [options] });
        // unknown is needed, but even though the cast is safe (the types are controlled), TypeScript cannot prove it.
        return this as unknown as SequenceBuilder<[...T, Blob]>;
    }

    async exec(): Promise<T> {
        const results = await this.proxy.runSequence(this.actions);
        const resolved = results.map((r, i) => {
            if (!r.success) throw new Error(`Action ${this.actions[i].type} failed: ${r.error}`);
            if (this.actions[i].type === "copyImageArrayBuffer") {
                return new Blob([r.value], this.actions[i].args?.[0]);
            }
            return r.value;
        });
        return resolved as T;
    }
}


export interface IWebGL2AsyncManager {
    setup(opts?: {
        dataImages?: Map<RenderLayer, HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[]>,
        elementDataImage?: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
        bgImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
        tileImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
        seed?: string
    }): Promise<void>;
    render(
        seed: string,
        numCellsWorldWidth: number,
        numCellsWorldHeight: number,
        num_cells_width: number,
        num_cells_height: number,
        num_cells_left_edge_x: number,
        num_cells_bottom_edge_y: number,
        canvas_width: number,
        canvas_height: number,
        renderLayer: RenderLayer
    ): Promise<void>; // TODO: use a more specific type as defined in WebGL2CanvasManager
    getIsReadyToRender(seed: string, renderLayer: RenderLayer): Promise<boolean>;
    clearCanvas(): Promise<void>;
    copyImageBlob(options?: ImageEncodeOptions): Promise<Blob>;
    transferImageBitmap(): Promise<ImageBitmap>;
}

export default class WebGL2Proxy implements IWebGL2AsyncManager {
    private worker: Worker;
    private requestId = 0;
    private callbacks: Record<number, (results: Result[]) => void> = {};

    constructor(...initArgs: any[]) {
        this.worker = new _WebGL2Worker();
        this.worker.onmessage = this.handleMessage.bind(this);
        this.post("init", { args: initArgs });
    }

    private post(type: string, payload: any, transfer: Transferable[] = []): number {
        const requestId = this.requestId++;
        this.worker.postMessage({ type, payload, requestId }, transfer);
        return requestId;
    }

    private handleMessage(event: MessageEvent): void {
        const { type, requestId, results } = event.data;
        if (type === "runSequenceComplete" && this.callbacks[requestId]) {
            this.callbacks[requestId](results);
            delete this.callbacks[requestId];
        }
    }

    public runSequence(actions: Action[], transfers: Transferable[] = []): Promise<Result[]> {
        return new Promise((resolve) => {
            const requestId = this.post("runSequence", { actions }, transfers);
            this.callbacks[requestId] = resolve;
        });
    }

    async setup(opts?: {
        dataImages?: Map<RenderLayer, HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[]>,
                    elementDataImage?: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
                    bgImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
                    tileImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
                    seed?: string
                }
    ): Promise<void> {
        await this.runSequence([{ type: "setup", args: [opts] }]);
    }

    async render(
        seed: string,
        worldWidth: number,
        worldHeight: number,
        width: number,
        height: number,
        xOffset: number,
        yOffset: number,
        canvasWidth: number,
        canvasHeight: number,
        layerIndex: RenderLayer
    ): Promise<void> {
        await this.runSequence([
            {
                type: "render",
                args: [seed, worldWidth, worldHeight, width, height, xOffset, yOffset, canvasWidth, canvasHeight, layerIndex],
            },
        ]);
    }

    /**
     * Checks if the WebGL2 context is ready to render.
     * @param renderLayer The layer to check.
     * @returns A promise that resolves to a boolean indicating if the context is ready to render.
     */
    async getIsReadyToRender(seed: string, renderLayer: RenderLayer): Promise<boolean> {
        const results = await this.runSequence([
            { type: "getIsReadyToRender", args: [renderLayer] }
        ]);
        return results[0].value as boolean;
    }

    async clearCanvas(): Promise<void> {
        await this.runSequence([{ type: "clearCanvas" }]);
    }

    async copyImageBlob(options: ImageEncodeOptions = { type: "image/webp" }): Promise<Blob> {
        const results = await this.runSequence([
            { type: "copyImageArrayBuffer", args: [options] }
        ]);
        const buffer = results[0].value as ArrayBuffer;
        return new Blob([buffer], options);
    }

    async transferImageBitmap(): Promise<ImageBitmap> {
        const results = await this.runSequence([
            { type: "transferImageBitmap" }
        ]);
        return results[0].value as ImageBitmap;
    }

    sequence() {
        return new SequenceBuilder(this);
    }

}