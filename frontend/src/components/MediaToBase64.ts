export const canvasToBase64 = async (canvas: OffscreenCanvas | HTMLCanvasElement, type: string = "image/png"): Promise<string> => {
    let blob: Blob;

    if ('convertToBlob' in canvas) {
        // OffscreenCanvas path
        blob = await (canvas as OffscreenCanvas).convertToBlob({ type });
    } else if ('toBlob' in canvas) {
        // HTMLCanvasElement path
        blob = await new Promise<Blob>((resolve, reject) => {
            (canvas as HTMLCanvasElement).toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error("Failed to convert HTMLCanvasElement to Blob"));
            }, type);
        });
    } else {
        throw new Error("Unsupported canvas type: cannot convert to Blob");
    }

    return blobToBase64(blob);
};

export const imageToBase64 = async (img: HTMLImageElement, type: string = "image/png"): Promise<string> => {
    if (!img.complete || img.naturalWidth === 0) {
        throw new Error("Image is not fully loaded or has invalid dimensions.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to get 2D context from canvas.");
    }

    ctx.drawImage(img, 0, 0);

    return canvasToBase64(canvas, type);
};

export const blobToBase64 = async (blob: Blob): Promise<string> => {
    const reader = new FileReader();

    const result = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error("Failed to read blob as base64 string."));
            }
        };
        reader.onerror = () => reject(new Error("Failed to read blob with FileReader."));
        reader.readAsDataURL(blob);
    });

    return result;
};

