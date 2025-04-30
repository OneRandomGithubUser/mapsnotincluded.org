import WebGLWorker from "@/components/WebGL2WebWorker?worker";

interface Action {
    type: string;
    args?: any[];
}

interface Result {
    success: boolean;
    value?: any;
    error?: string;
}

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
            dataImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
            elementDataImage?: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
            bgImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
            tileImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
            seed?: string
          }
    ): Promise<void>;
    render(...args: any[]): Promise<void>; // TODO: use a more specific type as defined in WebGL2CanvasManager
    clearCanvas(): Promise<void>;
    copyImageBlob(options?: ImageEncodeOptions): Promise<Blob>;
    transferImageBitmap(): Promise<ImageBitmap>;
}

export default class WebGL2Proxy implements IWebGL2AsyncManager {
    private worker: Worker;
    private requestId = 0;
    private callbacks: Record<number, (results: Result[]) => void> = {};

    constructor(...initArgs: any[]) {
        this.worker = new WebGLWorker();
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
                    dataImages?: HTMLImageElement[] | HTMLCanvasElement[] | OffscreenCanvas[] | ImageBitmap[],
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
        canvasHeight: number
    ): Promise<void> {
        await this.runSequence([
            {
                type: "render",
                args: [worldWidth, worldHeight, width, height, xOffset, yOffset, canvasWidth, canvasHeight],
            },
        ]);
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