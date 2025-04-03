
import WebGL2CanvasManager from "@/components/WebGL2_ts.js";

export class WebGL2WebWorker {
    private worker: Worker;
    private idCounter = 0;
    private callbacks = new Map<number, (value: any) => void>();

    constructor(workerScriptUrl: string) {
        this.worker = new Worker(workerScriptUrl, { type: 'module' });

        this.worker.onmessage = (e) => {
            const { id, result, error } = e.data;
            const callback = this.callbacks.get(id);
            if (callback) {
                callback(error ? Promise.reject(error) : result);
                this.callbacks.delete(id);
            }
        };
    }

    private send<T>(message: object): Promise<T> {
        const id = this.idCounter++;
        return new Promise<T>((resolve, reject) => {
            this.callbacks.set(id, (result) => {
                result instanceof Promise ? result.then(resolve).catch(reject) : resolve(result);
            });
            this.worker.postMessage({ ...message, id });
        });
    }

    async init(config: ConstructorParameters<typeof WebGL2CanvasManager>[0]) {
        return this.send<string>({ type: 'init', payload: config });
    }

    async call<T extends keyof WebGL2CanvasManager>(
        method: T,
        args: Parameters<WebGL2CanvasManager[T]>
    ): Promise<ReturnType<WebGL2CanvasManager[T]>> {
        return this.send<ReturnType<WebGL2CanvasManager[T]>>({ type: 'call', method, args });
    }
}
