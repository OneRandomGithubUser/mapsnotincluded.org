// Helper to load a single image and return a Promise
const loadImagePromise = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (err) => {
            console.error(`❌ Failed to load image: ${url}`, err);
            reject({ url, err });
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

// Modern async version
const loadImagesAsync = async (urls: string[]): Promise<HTMLImageElement[]> => {
    const imagePromises = urls.map(loadImagePromise);
    return Promise.all(imagePromises);
};

export { loadImagePromise as loadImage, loadImagesSync, loadImagesAsync };
