/* ---------- 图片转灰度：公式与 image_io.c 一致 ---------- */
function toGray(source, width, height, background) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      a = data[i + 3];
    const brightness = Math.floor((299 * r + 587 * g + 114 * b) / 1000);
    gray[p] = Math.floor((brightness * a + 255 * (255 - a) + 127) / 255);
  }
  return { width, height, gray };
}

const MAX_SOURCE_SIDE = 2400;

export function rasterizeImage(source, background) {
  const img = source.img;
  let image;
  if (source.kind === "demo") {
    image = toGray(img, 1024, 1024, background);
  } else {
    const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const scale = Math.min(1, MAX_SOURCE_SIDE / longest);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    image = toGray(img, width, height, background);
  }
  return image;
}

function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
}

export async function openDemoImage(base) {
  const response = await fetch(base + "favicon.svg");
  if (!response.ok) throw new Error("fetch failed");
  const source = await response.text();
  const sized = source.replace("<svg ", '<svg width="1024" height="1024" ');
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sized);
  return { img: await decodeImage(url), url };
}

export async function openImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    return { img: await decodeImage(url), url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
