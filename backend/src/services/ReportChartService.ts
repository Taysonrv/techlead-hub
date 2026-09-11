import {
  deflateSync,
} from "node:zlib";

export type ChartDatum = {
  label: string;
  value: number;
};

const COLORS = [
  [24, 199, 122],
  [0, 120, 212],
  [255, 170, 0],
  [220, 53, 69],
  [111, 66, 193],
  [32, 201, 151],
  [253, 126, 20],
  [108, 117, 125],
] as const;

export function createPieChartPng(
  values:
    ChartDatum[],
  width =
    720,
  height =
    360,
) {
  const canvas =
    createCanvas(
      width,
      height,
    );

  const data =
    normalize(
      values,
      8,
    );

  const total =
    data.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.value,
      0,
    );

  const centerX =
    Math.floor(
      width * 0.31,
    );
  const centerY =
    Math.floor(
      height / 2,
    );
  const radius =
    Math.floor(
      Math.min(
        width * 0.23,
        height * 0.39,
      ),
    );

  if (total <= 0) {
    drawCircle(
      canvas,
      centerX,
      centerY,
      radius,
      [222, 226, 230],
    );

    return encodePng(
      canvas,
    );
  }

  for (
    let y =
      centerY - radius;
    y <=
      centerY + radius;
    y += 1
  ) {
    for (
      let x =
        centerX - radius;
      x <=
        centerX + radius;
      x += 1
    ) {
      const dx =
        x - centerX;
      const dy =
        y - centerY;

      if (
        dx * dx +
          dy * dy >
        radius *
          radius
      ) {
        continue;
      }

      let angle =
        Math.atan2(
          dy,
          dx,
        ) +
        Math.PI /
          2;

      if (angle < 0) {
        angle +=
          Math.PI *
          2;
      }

      let accumulated =
        0;
      let colorIndex =
        data.length -
        1;

      for (
        let index =
          0;
        index <
          data.length;
        index += 1
      ) {
        accumulated +=
          (
            data[index]
              ?.value ??
            0
          ) /
          total *
          Math.PI *
          2;

        if (
          angle <=
          accumulated
        ) {
          colorIndex =
            index;
          break;
        }
      }

      setPixel(
        canvas,
        x,
        y,
        COLORS[
          colorIndex %
            COLORS.length
        ]!,
      );
    }
  }

  drawCircleOutline(
    canvas,
    centerX,
    centerY,
    radius,
    [255, 255, 255],
  );

  drawLegend(
    canvas,
    data,
    Math.floor(
      width * 0.58,
    ),
    40,
  );

  return encodePng(
    canvas,
  );
}

export function createBarChartPng(
  values:
    ChartDatum[],
  width =
    720,
  height =
    360,
) {
  const canvas =
    createCanvas(
      width,
      height,
    );

  const data =
    normalize(
      values,
      10,
    );
  const max =
    Math.max(
      1,
      ...data.map(
        (
          item,
        ) =>
          item.value,
      ),
    );
  const left =
    48;
  const top =
    25;
  const bottom =
    height - 45;
  const availableWidth =
    width -
    left -
    25;
  const gap =
    10;
  const barWidth =
    Math.max(
      12,
      Math.floor(
        (
          availableWidth -
          gap *
            Math.max(
              0,
              data.length -
                1,
            )
        ) /
        Math.max(
          1,
          data.length,
        ),
      ),
    );

  drawLine(
    canvas,
    left,
    top,
    left,
    bottom,
    [180, 187, 194],
  );
  drawLine(
    canvas,
    left,
    bottom,
    width - 20,
    bottom,
    [180, 187, 194],
  );

  data.forEach(
    (
      item,
      index,
    ) => {
      const barHeight =
        Math.max(
          item.value > 0
            ? 2
            : 0,
          Math.round(
            item.value /
            max *
            (
              bottom -
              top -
              12
            ),
          ),
        );
      const x =
        left +
        index *
          (
            barWidth +
            gap
          );
      const y =
        bottom -
        barHeight;

      fillRect(
        canvas,
        x,
        y,
        barWidth,
        barHeight,
        COLORS[
          index %
            COLORS.length
        ]!,
      );
    },
  );

  drawLegend(
    canvas,
    data.slice(
      0,
      5,
    ),
    58,
    height - 29,
    true,
  );

  return encodePng(
    canvas,
  );
}

function normalize(
  values:
    ChartDatum[],
  limit:
    number,
) {
  return values
    .filter(
      (
        item,
      ) =>
        Number.isFinite(
          item.value,
        ) &&
        item.value >= 0,
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.value -
        left.value,
    )
    .slice(
      0,
      limit,
    );
}

type Canvas = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

function createCanvas(
  width:
    number,
  height:
    number,
): Canvas {
  const pixels =
    new Uint8Array(
      width *
      height *
      4,
    );

  for (
    let index =
      0;
    index <
      pixels.length;
    index += 4
  ) {
    pixels[index] =
      255;
    pixels[index + 1] =
      255;
    pixels[index + 2] =
      255;
    pixels[index + 3] =
      255;
  }

  return {
    width,
    height,
    pixels,
  };
}

function setPixel(
  canvas:
    Canvas,
  x:
    number,
  y:
    number,
  color:
    readonly [
      number,
      number,
      number,
    ],
) {
  if (
    x < 0 ||
    y < 0 ||
    x >=
      canvas.width ||
    y >=
      canvas.height
  ) {
    return;
  }

  const index =
    (
      y *
      canvas.width +
      x
    ) *
    4;

  canvas.pixels[index] =
    color[0];
  canvas.pixels[index + 1] =
    color[1];
  canvas.pixels[index + 2] =
    color[2];
  canvas.pixels[index + 3] =
    255;
}

function fillRect(
  canvas:
    Canvas,
  x:
    number,
  y:
    number,
  width:
    number,
  height:
    number,
  color:
    readonly [
      number,
      number,
      number,
    ],
) {
  for (
    let row =
      Math.max(
        0,
        y,
      );
    row <
      Math.min(
        canvas.height,
        y + height,
      );
    row += 1
  ) {
    for (
      let column =
        Math.max(
          0,
          x,
        );
      column <
        Math.min(
          canvas.width,
          x + width,
        );
      column += 1
    ) {
      setPixel(
        canvas,
        column,
        row,
        color,
      );
    }
  }
}

function drawCircle(
  canvas:
    Canvas,
  centerX:
    number,
  centerY:
    number,
  radius:
    number,
  color:
    readonly [
      number,
      number,
      number,
    ],
) {
  for (
    let y =
      -radius;
    y <= radius;
    y += 1
  ) {
    for (
      let x =
        -radius;
      x <= radius;
      x += 1
    ) {
      if (
        x * x +
          y * y <=
        radius *
          radius
      ) {
        setPixel(
          canvas,
          centerX + x,
          centerY + y,
          color,
        );
      }
    }
  }
}

function drawCircleOutline(
  canvas:
    Canvas,
  centerX:
    number,
  centerY:
    number,
  radius:
    number,
  color:
    readonly [
      number,
      number,
      number,
    ],
) {
  for (
    let degree =
      0;
    degree <
      360;
    degree += 1
  ) {
    const angle =
      degree *
      Math.PI /
      180;

    setPixel(
      canvas,
      Math.round(
        centerX +
        Math.cos(
          angle,
        ) *
        radius,
      ),
      Math.round(
        centerY +
        Math.sin(
          angle,
        ) *
        radius,
      ),
      color,
    );
  }
}

function drawLine(
  canvas:
    Canvas,
  x1:
    number,
  y1:
    number,
  x2:
    number,
  y2:
    number,
  color:
    readonly [
      number,
      number,
      number,
    ],
) {
  const steps =
    Math.max(
      Math.abs(
        x2 - x1,
      ),
      Math.abs(
        y2 - y1,
      ),
      1,
    );

  for (
    let step =
      0;
    step <= steps;
    step += 1
  ) {
    setPixel(
      canvas,
      Math.round(
        x1 +
        (
          x2 - x1
        ) *
        step /
        steps,
      ),
      Math.round(
        y1 +
        (
          y2 - y1
        ) *
        step /
        steps,
      ),
      color,
    );
  }
}

function drawLegend(
  canvas:
    Canvas,
  values:
    ChartDatum[],
  x:
    number,
  y:
    number,
  horizontal =
    false,
) {
  values.forEach(
    (
      _item,
      index,
    ) => {
      const currentX =
        horizontal
          ? x +
            index *
              120
          : x;
      const currentY =
        horizontal
          ? y
          : y +
            index *
              32;

      fillRect(
        canvas,
        currentX,
        currentY,
        18,
        18,
        COLORS[
          index %
            COLORS.length
        ]!,
      );
    },
  );
}

function encodePng(
  canvas:
    Canvas,
) {
  const scanlineLength =
    canvas.width *
    4 +
    1;
  const raw =
    Buffer.alloc(
      scanlineLength *
      canvas.height,
    );

  for (
    let y =
      0;
    y <
      canvas.height;
    y += 1
  ) {
    const target =
      y *
      scanlineLength;
    raw[target] =
      0;

    Buffer.from(
      canvas.pixels.buffer,
      canvas.pixels.byteOffset +
        y *
          canvas.width *
          4,
      canvas.width *
        4,
    ).copy(
      raw,
      target + 1,
    );
  }

  const signature =
    Buffer.from([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
    ]);

  const header =
    Buffer.alloc(
      13,
    );
  header.writeUInt32BE(
    canvas.width,
    0,
  );
  header.writeUInt32BE(
    canvas.height,
    4,
  );
  header[8] =
    8;
  header[9] =
    6;

  return Buffer.concat([
    signature,
    chunk(
      "IHDR",
      header,
    ),
    chunk(
      "IDAT",
      deflateSync(
        raw,
        {
          level:
            9,
        },
      ),
    ),
    chunk(
      "IEND",
      Buffer.alloc(
        0,
      ),
    ),
  ]);
}

function chunk(
  type:
    string,
  data:
    Buffer,
) {
  const name =
    Buffer.from(
      type,
      "ascii",
    );
  const result =
    Buffer.alloc(
      12 +
      data.length,
    );

  result.writeUInt32BE(
    data.length,
    0,
  );
  name.copy(
    result,
    4,
  );
  data.copy(
    result,
    8,
  );
  result.writeUInt32BE(
    crc32(
      Buffer.concat([
        name,
        data,
      ]),
    ),
    8 +
      data.length,
  );

  return result;
}

function crc32(
  value:
    Buffer,
) {
  let crc =
    0xffffffff;

  for (
    const byte of value
  ) {
    crc ^=
      byte;

    for (
      let bit =
        0;
      bit <
        8;
      bit += 1
    ) {
      crc =
        (
          crc >>>
          1
        ) ^
        (
          crc &
          1
            ? 0xedb88320
            : 0
        );
    }
  }

  return (
    crc ^
    0xffffffff
  ) >>> 0;
}
