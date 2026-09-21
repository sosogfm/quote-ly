// Downscale + recompress images in the browser before sending them to the AI.
// High-resolution photos easily blow past the request body limit of the edge
// function (HTTP 400/413); 1920px JPEG at 0.82 keeps payloads well under 2MB.

const MAX_DIMENSION = 1920;
const QUALITY = 0.82;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não foi possível ler a imagem ${file.name}`));
    };
    img.src = url;
  });
}

/** Returns a `data:image/jpeg;base64,...` URL, downscaled and compressed. */
export async function compressImageToDataUrl(file: File): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível para comprimir a imagem.");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  // Base64 inflates bytes by ~33%: shrink quality until the payload fits.
  while (dataUrl.length * 0.75 > MAX_IMAGE_BYTES && quality > 0.4) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}
