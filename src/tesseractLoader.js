let tesseract = null;
let tesseractLoadPromise = null;

export function loadTesseract() {
    if (tesseract) return Promise.resolve();
    if (tesseractLoadPromise) return tesseractLoadPromise;

    tesseractLoadPromise = import('tesseract.js').then(module => {
        tesseract = module.default || module;
        return tesseract;
    }).catch(err => {
        tesseractLoadPromise = null;
        throw err;
    });

    return tesseractLoadPromise;
}

export function getTesseract() {
    return tesseract;
}
