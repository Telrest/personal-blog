// 字符梯度与 C 版本 ascii.c 保持一致 / Same ramp as the C version.
const RAMP =
  ' .`^",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
const BITS = [
  [0, 3],
  [1, 4],
  [2, 5],
  [6, 7],
];
const MAX_COLS = 600;
const MAX_ROWS = 1200;

/* ---------- 转换算法：与 ascii.c 一致 ---------- */
function grayAverage(image, x0, y0, x1, y1) {
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * image.width;
    for (let x = x0; x < x1; x++) {
      sum += image.gray[row + x];
      count++;
    }
  }
  return Math.floor((sum + count / 2) / count);
}

function enhanceSamples(samples, width, height) {
  const histogram = new Uint32Array(256);
  const count = width * height;
  for (let i = 0; i < count; i++) histogram[Math.floor(samples[i]) & 255]++;

  const tail = Math.floor(count / 100);
  let low = 0;
  let high = 255;
  let acc = 0;
  while (low < 255 && acc + histogram[low] <= tail) acc += histogram[low++];
  acc = 0;
  while (high > 0 && acc + histogram[high] <= tail) acc += histogram[high--];

  if (high - low >= 16 && high - low < 240) {
    let gain = 255 / (high - low);
    if (gain > 2.2) gain = 2.2;
    const middle = (low + high) * 0.5;
    for (let i = 0; i < count; i++) {
      const value = (samples[i] - middle) * gain + 127.5;
      samples[i] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
  }

  const copy = samples.slice();
  for (let y = 1; y + 1 < height; y++) {
    for (let x = 1; x + 1 < width; x++) {
      const p = y * width + x;
      const nearby =
        (copy[p - 1] + copy[p + 1] + copy[p - width] + copy[p + width]) * 0.25;
      const value = copy[p] + 0.6 * (copy[p] - nearby);
      samples[p] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
  }
}

function ditherSamples(samples, width, height) {
  for (let y = 0; y < height; y++) {
    const direction = y % 2 ? -1 : 1;
    const begin = direction === 1 ? 0 : width - 1;
    const end = direction === 1 ? width : -1;
    for (let x = begin; x !== end; x += direction) {
      const p = y * width + x;
      let value = samples[p];
      if (value < 0) value = 0;
      if (value > 255) value = 255;
      const rounded = value >= 128 ? 255 : 0;
      const error = value - rounded;
      samples[p] = rounded;
      const next = x + direction;
      const previous = x - direction;
      if (next >= 0 && next < width)
        samples[y * width + next] += error * (7 / 16);
      if (y + 1 < height) {
        samples[p + width] += error * (5 / 16);
        if (previous >= 0 && previous < width)
          samples[(y + 1) * width + previous] += error * (3 / 16);
        if (next >= 0 && next < width)
          samples[(y + 1) * width + next] += error * (1 / 16);
      }
    }
  }
}

export function renderAscii(image, options) {
  const cellAspect = 0.5;
  let columns = Math.round(options.columns);
  columns = Math.max(1, Math.min(MAX_COLS, columns));

  const aspect = (image.height / image.width) * cellAspect;
  if (columns * aspect > MAX_ROWS)
    columns = Math.max(1, Math.floor(MAX_ROWS / aspect));
  let height = Math.round(columns * aspect);
  if (height < 1) height = 1;
  if (height > MAX_ROWS) height = MAX_ROWS;

  const sampleWidth = columns * (options.braille ? 2 : 1);
  const sampleHeight = height * (options.braille ? 4 : 1);
  const samples = new Float32Array(sampleWidth * sampleHeight);

  for (let y = 0; y < sampleHeight; y++) {
    const y0 = Math.floor((y * image.height) / sampleHeight);
    let y1 = Math.floor(((y + 1) * image.height) / sampleHeight);
    if (y1 <= y0) y1 = y0 + 1;
    for (let x = 0; x < sampleWidth; x++) {
      const x0 = Math.floor((x * image.width) / sampleWidth);
      let x1 = Math.floor(((x + 1) * image.width) / sampleWidth);
      if (x1 <= x0) x1 = x0 + 1;
      samples[y * sampleWidth + x] = grayAverage(image, x0, y0, x1, y1);
    }
  }

  if (options.enhance) enhanceSamples(samples, sampleWidth, sampleHeight);
  if (options.braille) ditherSamples(samples, sampleWidth, sampleHeight);

  const lines = [];
  if (!options.braille) {
    const last = RAMP.length - 1;
    for (let row = 0; row < height; row++) {
      let line = "";
      for (let col = 0; col < columns; col++) {
        let value = Math.round(samples[row * sampleWidth + col]);
        if (options.light) value = 255 - value;
        line += RAMP[Math.floor((value * last) / 255)];
      }
      lines.push(line);
    }
  } else {
    for (let row = 0; row < height; row++) {
      let line = "";
      for (let col = 0; col < columns; col++) {
        let mask = 0;
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const bright =
              samples[(row * 4 + dy) * sampleWidth + col * 2 + dx] >= 128;
            if (bright !== !!options.light) mask |= 1 << BITS[dy][dx];
          }
        }
        // 空格也要用 U+2800（盲文空白），不能用普通空格：
        // 普通空格来自主字体、盲文来自回退字体，两者步进宽度不同，
        // 混排后每行像素宽度不一致，右边缘就会参差不齐。
        // Use BRAILLE PATTERN BLANK for empty cells: a plain space comes from a
        // different font, so mixed advance widths make the right edge ragged.
        line += String.fromCharCode(0x2800 + mask);
      }
      lines.push(line);
    }
  }
  return { lines, columns, height };
}
