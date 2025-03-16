function loadImage (url, callback) {
    var image = new Image();
    image.src = url;
    image.onload = callback;
    return image;
  }
function loadImages(urls, callback, ...extraParams) {
    var images = []; // TODO: This should be a map, not an array. Also, not a global.
    var imagesToLoad = urls.length;

    // Called each time an image finished loading.
    var onImageLoad = function() {
        --imagesToLoad;
        // If all the images are loaded call the callback.
        if (imagesToLoad === 0) {
        callback(images, ...extraParams);
        }
    };

    for (var ii = 0; ii < imagesToLoad; ++ii) {
        var image = loadImage(urls[ii], onImageLoad);
        images.push(image);
    }
}
export {loadImage, loadImages};