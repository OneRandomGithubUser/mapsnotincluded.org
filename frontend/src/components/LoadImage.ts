// Helper to load a single image and return a Promise
const loadImagePromise = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (err) => {
            const msg = `❌ Failed to load image: ${url}`;
            console.error(msg, err);
            reject(new Error(msg, {cause: err}));
        };
        image.src = url;
    });
};

// Legacy-style callback interface
const loadImagesSync = (
    urls: string[],
    onAllSuccess: (images: HTMLImageElement[], ...args: any[]) => void,
    onError?: (url: string, err: any) => void,
    ...extraParams: any[]
): void => {
    const images: HTMLImageElement[] = [];
    let imagesToLoad = urls.length;

    if (imagesToLoad === 0) {
        onAllSuccess(images, ...extraParams);
        return;
    }

    urls.forEach((url, i) => {
        loadImagePromise(url)
            .then((img) => {
                images[i] = img;
                imagesToLoad--;
                if (imagesToLoad === 0) {
                    onAllSuccess(images, ...extraParams);
                }
            })
            .catch(({ url, err }) => {
                if (onError) onError(url, err);
            });
    });
};

// TODO: Add error handling for failed image loads, and multi loadAndPad calls
// Modern async version
const loadImagesAsync = async (urls: string[]): Promise<{
    successes: { url: string, image: HTMLImageElement }[],
    failures: { url: string, error: any }[]
}> => {
    const results = await Promise.allSettled(
        urls.map(url =>
            loadImagePromise(url)
                .then(image => ({ url, image }))
                .catch(error => {
                    throw new Error(url, { cause: error });
                })
        )
    );

    const successes: { url: string, image: HTMLImageElement }[] = [];
    const failures: { url: string, error: any }[] = [];

    for (const result of results) {
        if (result.status === "fulfilled") {
            successes.push(result.value);
        } else {
            failures.push(result.reason);
        }
    }

    return { successes, failures };
};

export async function loadAndPad(
    url: string,
    w: number,
    h: number
): Promise<ImageBitmap> {
    try {
        const img = await loadImagePromise(url);
        const cvs = new OffscreenCanvas(w, h);
        const ctx = cvs.getContext("2d");

        if (!ctx) {
            throw new Error("Failed to get 2D context");
        }

        // Fill with opaque white
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);

        // Center the image
        const x = Math.floor((w - img.width) / 2);
        const y = Math.floor((h - img.height) / 2);
        ctx.drawImage(img, x, y);

        return cvs.transferToImageBitmap();
    } catch (err: unknown) {
        const msg = `❌ Failed to load and pad image: ${url}`
        // console.error(msg, err);
        throw new Error( msg, { cause: err });
    }
}

export { loadImagePromise as loadImage, loadImagesSync, loadImagesAsync };
