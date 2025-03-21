const loadImage = (
    url: string,
    onLoad: () => void,
    onError?: (url: string, err: any) => void
): HTMLImageElement => {
    const image = new Image();
    image.onload = onLoad;
    image.onerror = (err) => {
        console.error(`❌ Failed to load image: ${url}`, err);
        if (onError) onError(url, err);
    };
    image.src = url;
    return image;
};

const loadImages = (
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

    const onImageLoad = () => {
        imagesToLoad--;
        if (imagesToLoad === 0) {
            onAllSuccess(images, ...extraParams);
        }
    };

    urls.forEach((url) => {
        const image = loadImage(url, onImageLoad, onError);
        images.push(image);
    });
};

export { loadImage, loadImages };
