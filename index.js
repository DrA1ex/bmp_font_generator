const cEditor = document.getElementById("cEditor");
const eCtx = cEditor.getContext("2d");

const cOverlay = document.getElementById("cOverlay");
const oCtx = cOverlay.getContext("2d");

const cPreview = document.getElementById("cPreview");
const pCtx = cPreview.getContext("2d");

const fBitmap = document.getElementById("fBitmap");

const tCode = document.getElementById("tCode");
document.getElementById("bConvert").onclick = () => convert();

const Scale = window.devicePixelRatio;

let BitmapLoaded = false;
let LineActive = false;
let LineX = 0;

const Lines = new Set();

fBitmap.onchange = async () => {
    if (fBitmap.files.length === 0) return;

    const img = document.createElement("img");
    const loadPromise = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });

    img.src = URL.createObjectURL(fBitmap.files[0]);

    BitmapLoaded = false;

    try {
        await loadPromise;

        cEditor.width = img.width;
        cEditor.height = img.height;

        cOverlay.width = cEditor.width * Scale;
        cOverlay.height = cEditor.height * Scale;

        oCtx.scale(Scale, Scale);

        eCtx.fillStyle = "black";
        eCtx.fillRect(0, 0, cEditor.width, cEditor.height);
        eCtx.drawImage(img, 0, 0);

        Lines.clear();

        BitmapLoaded = true;
    } finally {
        img.remove();
        fBitmap.value = null;
    }
};

cOverlay.onmouseenter = () => {
    if (BitmapLoaded) LineActive = true;
};
cOverlay.onmouseleave = () => {
    LineActive = false;
    updateOverlay();
};

cOverlay.onmousemove = e => {
    if (!LineActive) return;

    LineX = Math.round(e.offsetX * (cEditor.width / cEditor.getBoundingClientRect().width));
    if (LineX < 0) LineX = 0;
    if (LineX >= cEditor.width) LineX = cEditor.width - 1;

    updateOverlay();
}

cOverlay.onmouseup = () => {
    if (!LineActive) return;

    if (Lines.has(LineX)) {
        Lines.delete(LineX);
    } else {
        Lines.add(LineX);
    }

    updatePreview();
}

function updateOverlay() {
    oCtx.clearRect(0, 0, cEditor.width, cEditor.height);
    oCtx.lineWidth = 1;

    oCtx.strokeStyle = "red";

    for (const x of Lines) {
        oCtx.beginPath();
        oCtx.moveTo(x, 0);
        oCtx.lineTo(x, cEditor.height);
        oCtx.stroke();
    }

    if (LineActive) {
        oCtx.strokeStyle = "#00ffff";

        oCtx.beginPath();
        oCtx.moveTo(LineX, 0);
        oCtx.lineTo(LineX, cEditor.height);
        oCtx.stroke();
    }
}

function updatePreview() {
    const maxWidth = Math.floor(cPreview.getBoundingClientRect().width);

    const lineSorted = Array.from(Lines).sort((a, b) => a - b);

    let maxSize = 0;
    for (let i = 1; i < lineSorted.length; i++) {
        const size = lineSorted[i] - lineSorted[i - 1];
        if (size > maxSize) maxSize = size;
    }

    const margin = 1;
    const colSize = maxSize;
    const rowSize = cEditor.height;

    const count = Lines.size - 1;
    const cols = Math.floor(maxWidth / colSize);
    const rows = Math.ceil(count / cols);

    cPreview.width = (cols * colSize + margin * (cols + 1)) * Scale;
    cPreview.height = (rows * rowSize + margin * (rows + 1)) * Scale;

    pCtx.scale(Scale, Scale);
    pCtx.imageSmoothingEnabled = false;

    pCtx.fillStyle = "black";
    pCtx.fillRect(0, 0, cPreview.width / Scale, cPreview.height / Scale);

    pCtx.strokeStyle = "white";
    for (let i = 0; i < rows; i++) {
        const yOffset = margin + i * (rowSize + margin);
        hLine(cPreview, pCtx, yOffset - margin);

        for (let j = 0; j < cols; j++) {
            const xOffset = margin + j * (colSize + margin);
            if (i === 0) vLine(cPreview, pCtx, xOffset - margin);

            const index = i * cols + j;
            const width = lineSorted[index + 1] - lineSorted[index];
            pCtx.drawImage(cEditor, lineSorted[index], 0, width, rowSize, xOffset, yOffset, width, rowSize);
        }
    }

    vLine(cPreview, pCtx, margin + cols * (colSize + margin));
    hLine(cPreview, pCtx, margin + rows * (rowSize + margin));
}

function hLine(canvas, ctx, y) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
}

function vLine(canvas, ctx, x) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
}

function convert() {
    if (Lines.size < 2) return;

    const threshold = 128;
    const padding = 8;

    const width = cEditor.width;
    const height = cEditor.height;

    const imgData = eCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const glyphs = [];
    const binary = [];

    const lineSorted = Array.from(Lines).sort((a, b) => a - b);
    for (let i = 0; i < lineSorted.length - 1; i++) {
        const size = lineSorted[i + 1] - lineSorted[i];
        const xOffset = lineSorted[i] * 4;

        glyphs.push({
            offset: binary.length * (padding / 8),
            width: size,
            height,
            xOffset: 3,
            yOffset: -height,
            xAdv: size
        })

        for (let y = 0; y < height; y++) {
            const yOffset = y * width * 4;

            let glyphData = 0x0;
            for (let x = 0; x < size; x++) {
                if (x > 0 && x % padding === 0) {
                    binary.push(glyphData);
                    glyphData = 0x0;
                }

                const byteOffset = yOffset + xOffset + x * 4;
                const bit = Math.max(data[byteOffset], data[byteOffset + 1], data[byteOffset + 2]) > threshold
                            && data[byteOffset + 3] > threshold ? 1 : 0;

                if (bit) glyphData |= bit << (x % padding);
            }

            if (size % padding > 0) {
                binary.push(glyphData);
            }
        }
    }

    const name = "custom_font";

    let result = `const uint8_t ${name}_data[] PROGMEM = {`;
    for (let i = 0; i < binary.length; i++) {
        if (i % 12 === 0) result += "\n  ";

        result += "0x" + binary[i].toString(16).padStart(2, "0") + ", ";
    }
    result += "\n};\n\n";

    result += `const GFXglyph ${name}_glyphs[] PROGMEM = {\n`;
    for (const glyph of glyphs) {
        result += `  { ${glyph.offset}, ${glyph.width}, ${glyph.height}, ${glyph.xAdv}, ${glyph.xOffset}, ${glyph.yOffset} },\n`
    }
    result += "};\n\n";

    result += `const GFXfont ${name} PROGMEM = {\n`;
    result += `  (uint8_t  *)${name}_data,\n`;
    result += `  (GFXglyph *)${name}_glyphs,\n`;
    result += `  0x30, ${"0x" + (0x30 + glyphs.length - 1).toString(16).padStart(2, "0")}, ${height} };`

    tCode.textContent = result;
}