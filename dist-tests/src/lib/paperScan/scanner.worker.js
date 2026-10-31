import { normalizeScanPhoto } from "./recognition.js";
self.onmessage = (event) => {
    try {
        const result = normalizeScanPhoto(event.data);
        self.postMessage(result, { transfer: [result.image.data.buffer] });
    }
    catch (cause) {
        self.postMessage({ error: cause instanceof Error ? cause.message : "Could not read this photo. Try again." });
    }
};
