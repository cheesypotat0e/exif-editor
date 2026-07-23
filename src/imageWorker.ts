type OverlayRecipe = {
  timestampLine: string;
  addressLines: string[];
};

type RenderRequest = {
  id: number;
  source: Blob;
  width?: number;
  height?: number;
  maxEdge?: number;
  quality: number;
  orientation?: number;
  overlay?: OverlayRecipe;
};

type RenderResponse =
  | { id: number; blob: Blob }
  | { id: number; error: string };

function getTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  request: RenderRequest,
) {
  let width = request.width ?? sourceWidth;
  let height = request.height ?? sourceHeight;

  if (request.maxEdge && Math.max(width, height) > request.maxEdge) {
    const scale = request.maxEdge / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  return { width, height };
}

function drawOverlay(
  context: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: OverlayRecipe,
) {
  const lines = [overlay.timestampLine, ...overlay.addressLines.slice(0, 4)];
  const shortEdge = Math.min(width, height);
  const fontSize = shortEdge * 0.0562;
  const lineHeight = shortEdge * 0.0618;
  const marginX = shortEdge * 0.0565;
  const marginBottom = shortEdge * 0.0565;
  const shadowOffset = Math.max(1, shortEdge * 0.0007);

  context.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro", Roboto, Arial, sans-serif`;
  context.fillStyle = "#fff";
  context.textAlign = "left";
  context.textBaseline = "bottom";
  context.shadowColor = "#000";
  context.shadowOffsetX = shadowOffset;
  context.shadowOffsetY = shadowOffset;
  context.shadowBlur = Math.max(1, shadowOffset * 0.5);

  let currentY = height - marginBottom;
  for (let index = lines.length - 1; index >= 0; index--) {
    context.fillText(lines[index], marginX, currentY);
    currentY -= lineHeight;
  }
}

function swapsDimensions(orientation: number) {
  return orientation >= 5 && orientation <= 8;
}

function drawOrientedImage(
  context: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
  orientation: number,
) {
  context.save();
  switch (orientation) {
    case 2:
      context.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      context.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      context.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      context.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      context.transform(0, 1, -1, 0, width, 0);
      break;
    case 7:
      context.transform(0, -1, -1, 0, width, height);
      break;
    case 8:
      context.transform(0, -1, 1, 0, 0, height);
      break;
  }
  context.drawImage(
    bitmap,
    0,
    0,
    swapsDimensions(orientation) ? height : width,
    swapsDimensions(orientation) ? width : height,
  );
  context.restore();
}

self.addEventListener("message", (event: MessageEvent<RenderRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      const orientation = request.orientation ?? 1;
      const requestedDimensions =
        request.width && request.height
          ? getTargetDimensions(request.width, request.height, request)
          : null;
      const bitmap = requestedDimensions
        ? await createImageBitmap(request.source, {
            imageOrientation: "none",
            resizeWidth: swapsDimensions(orientation)
              ? requestedDimensions.height
              : requestedDimensions.width,
            resizeHeight: swapsDimensions(orientation)
              ? requestedDimensions.width
              : requestedDimensions.height,
            resizeQuality: "high",
          })
        : await createImageBitmap(request.source, {
            imageOrientation: "none",
          });
      const dimensions =
        requestedDimensions ??
        getTargetDimensions(
          swapsDimensions(orientation) ? bitmap.height : bitmap.width,
          swapsDimensions(orientation) ? bitmap.width : bitmap.height,
          request,
        );
      const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas rendering is unavailable");
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      drawOrientedImage(
        context,
        bitmap,
        dimensions.width,
        dimensions.height,
        orientation,
      );
      bitmap.close();

      if (request.overlay) {
        drawOverlay(
          context,
          dimensions.width,
          dimensions.height,
          request.overlay,
        );
      }

      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: request.quality,
      });
      const response: RenderResponse = { id: request.id, blob };
      self.postMessage(response);
    } catch (error) {
      const response: RenderResponse = {
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    }
  })();
});

export {};
