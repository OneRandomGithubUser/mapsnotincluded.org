const canvasToBase64 = async (canvas: OffscreenCanvas | HTMLCanvasElement): Promise<string> => {
    let blob: Blob;

    if ('convertToBlob' in canvas) {
        // OffscreenCanvas path
        blob = await (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
    } else if ('toBlob' in canvas) {
        // HTMLCanvasElement path
        blob = await new Promise<Blob>((resolve, reject) => {
            (canvas as HTMLCanvasElement).toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error("Failed to convert canvas to blob"));
            }, "image/png");
        });
    } else {
        throw new Error("Unsupported canvas type");
    }

    // Read the blob as a base64 string
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export default { canvasToBase64 };