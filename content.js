// Content script - injects the mapper into the page context
(function() {
  // Run in the page's MAIN world at document_start so the game's WebGL canvas
  // is created with a readable back buffer. Without this, readPixels/toDataURL
  // often returns all zeroes after the frame is presented.
  if (!window.__cmPreserveDrawingBufferPatched) {
    window.__cmPreserveDrawingBufferPatched = true;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs) {
      const name = String(type || '').toLowerCase();
      if (name === 'webgl' || name === 'webgl2' || name === 'experimental-webgl') {
        attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
      }
      return originalGetContext.call(this, type, attrs);
    };
  }

  // The mapper itself is loaded by manifest.json at document_end.
})();
