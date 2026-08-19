import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
/** Wallpaper Engine texture format ids (TEXI0001 header), per RePKG/lwe. */
const TexFormat = {
	RGBA8888: 0,
	RGB888: 1,
	RGB565: 2,
	DXT5: 4,
	DXT3: 6,
	DXT1: 7,
	RG88: 8,
	R8: 9,
	RG1616F: 10,
	R16F: 11,
	BC7: 12,
	RGBA1010102: 13,
	RGBA16161616F: 14,
	RGB161616F: 15
};
const TEX_FORMAT_NAMES = {
	0: "RGBA8888",
	1: "RGB888",
	2: "RGB565",
	4: "DXT5",
	6: "DXT3",
	7: "DXT1",
	8: "RG88",
	9: "R8",
	10: "RG1616F",
	11: "R16F",
	12: "BC7",
	13: "RGBA1010102",
	14: "RGBA16161616F",
	15: "RGB161616F"
};
/** TEXI0001 flags bit marking an animated (sprite-sheet / gif) texture. */
const TEX_FLAG_IS_GIF = 4;
const textDecoder = new TextDecoder("utf-8");
/**
* Bounds-checked little-endian binary reader. Every failed read throws an
* Error prefixed with the reader label (e.g. 'pkg: unexpected end of data').
*/
var Reader = class {
	data;
	label;
	view;
	pos = 0;
	constructor(data, label) {
		this.data = data;
		this.label = label;
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	}
	get remaining() {
		return this.view.byteLength - this.pos;
	}
	need(n) {
		if (n < 0 || this.pos + n > this.view.byteLength) throw new Error(this.label + ": unexpected end of data");
	}
	u8() {
		this.need(1);
		return this.view.getUint8(this.pos++);
	}
	i32() {
		this.need(4);
		const v = this.view.getInt32(this.pos, true);
		this.pos += 4;
		return v;
	}
	u32() {
		this.need(4);
		const v = this.view.getUint32(this.pos, true);
		this.pos += 4;
		return v;
	}
	/** Unsigned 64-bit integer; safe up to 2^53. */
	u64() {
		const lo = this.u32();
		return this.u32() * 4294967296 + lo;
	}
	f32() {
		this.need(4);
		const v = this.view.getFloat32(this.pos, true);
		this.pos += 4;
		return v;
	}
	bytes(n) {
		this.need(n);
		const out = this.data.subarray(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}
	/** int32-length-prefixed UTF-8 string (PKG magic and entry paths). */
	sizedString(maxLength) {
		const length = this.i32();
		if (length < 0 || length > maxLength) throw new Error(this.label + ": invalid string length " + length);
		return textDecoder.decode(this.bytes(length));
	}
	/** NUL-terminated string (all TEX magics and the TEXB0004 json blob). */
	nstring(maxLength) {
		const start = this.pos;
		let end = start;
		const limit = Math.min(this.view.byteLength, start + maxLength);
		while (end < limit && this.view.getUint8(end) !== 0) end++;
		if (end >= limit) throw new Error(this.label + ": unterminated string");
		const out = textDecoder.decode(this.data.subarray(start, end));
		this.pos = end + 1;
		return out;
	}
};
/**
* Decompress one raw LZ4 block (the format inside PKG entry chains and TEXB
* mipmaps) following the official lz4 block format specification.
*
* @param src compressed block bytes
* @param dstSize exact expected decompressed size
*/
function lz4DecompressBlock(src, dstSize) {
	const dst = new Uint8Array(dstSize);
	let ip = 0;
	let op = 0;
	while (ip < src.length) {
		const token = src[ip++];
		let literalLength = token >> 4;
		if (literalLength === 15) {
			let s = 0;
			do {
				if (ip >= src.length) throw new Error("lz4: truncated literal length");
				s = src[ip++];
				literalLength += s;
			} while (s === 255);
		}
		if (ip + literalLength > src.length || op + literalLength > dstSize) throw new Error("lz4: literal run out of bounds");
		dst.set(src.subarray(ip, ip + literalLength), op);
		ip += literalLength;
		op += literalLength;
		if (ip >= src.length) break;
		if (ip + 2 > src.length) throw new Error("lz4: truncated match offset");
		const offset = src[ip] | src[ip + 1] << 8;
		ip += 2;
		if (offset === 0 || offset > op) throw new Error("lz4: invalid match offset " + offset);
		let matchLength = token & 15;
		if (matchLength === 15) {
			let s = 0;
			do {
				if (ip >= src.length) throw new Error("lz4: truncated match length");
				s = src[ip++];
				matchLength += s;
			} while (s === 255);
		}
		matchLength += 4;
		if (op + matchLength > dstSize) throw new Error("lz4: match run out of bounds");
		for (let i = 0; i < matchLength; i++) {
			dst[op] = dst[op - offset];
			op++;
		}
	}
	if (op !== dstSize) throw new Error("lz4: decompressed size mismatch (got " + op + ", expected " + dstSize + ")");
	return dst;
}
/**
* Probe whether the entry data at [abs, abs+length) is an LZ4 block chain:
* int64 original size followed by [int32 uncomp][int32 comp][block] entries
* that reconstruct exactly originalSize bytes while consuming the entry to
* the byte. Returns the original size when the chain fits perfectly.
*/
function probeCompressedEntry(data, abs, length) {
	if (length < 8) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const originalSize = view.getUint32(abs, true) + view.getUint32(abs + 4, true) * 4294967296;
	if (originalSize <= length || originalSize > 2147483647) return null;
	let pos = abs + 8;
	let total = 0;
	while (total < originalSize) {
		if (pos + 8 > abs + length) return null;
		const uncomp = view.getInt32(pos, true);
		const comp = view.getInt32(pos + 4, true);
		if (uncomp <= 0 || comp <= 0 || pos + 8 + comp > abs + length) return null;
		total += uncomp;
		pos += 8 + comp;
	}
	return total === originalSize && pos === abs + length ? originalSize : null;
}
/**
* Parse a PKG container (magic PKGVxxxx) and return its entry index.
* Entry offsets in the returned list are absolute positions inside data.
*/
function parsePkg(data) {
	const r = new Reader(data, "pkg");
	const magic = r.sizedString(32);
	if (!/^PKGV\d{4}$/.test(magic)) throw new Error("pkg: bad magic '" + magic + "'");
	const count = r.i32();
	if (count < 0 || count > 1048576) throw new Error("pkg: invalid entry count " + count);
	const index = [];
	for (let i = 0; i < count; i++) index.push({
		path: r.sizedString(1024),
		offset: r.u32(),
		length: r.u32()
	});
	const dataStart = r.pos;
	return index.map(({ path, offset, length }) => {
		const abs = dataStart + offset;
		if (abs + length > data.byteLength) throw new Error("pkg: entry '" + path + "' out of bounds");
		const originalSize = probeCompressedEntry(data, abs, length);
		return originalSize === null ? {
			path,
			offset: abs,
			compressedSize: length,
			size: length,
			flags: 0
		} : {
			path,
			offset: abs,
			compressedSize: length,
			size: originalSize,
			flags: 1
		};
	});
}
/**
* Extract (and decompress, when the entry uses LZ4 block-chain storage) one
* package entry. Returns a fresh buffer of exactly entry.size bytes.
*/
function readPkgEntry(data, entry) {
	const abs = entry.offset;
	if (abs < 0 || abs + entry.compressedSize > data.byteLength) throw new Error("pkg: entry '" + entry.path + "' out of bounds");
	if ((entry.flags & 1) === 0) return data.slice(abs, abs + entry.compressedSize);
	const r = new Reader(data.subarray(abs, abs + entry.compressedSize), "pkg");
	if (r.u64() !== entry.size) throw new Error("pkg: entry '" + entry.path + "' size mismatch");
	const out = new Uint8Array(entry.size);
	let written = 0;
	while (written < entry.size) {
		const uncomp = r.i32();
		const comp = r.i32();
		if (uncomp <= 0 || comp <= 0 || written + uncomp > entry.size) throw new Error("pkg: corrupt compressed entry '" + entry.path + "'");
		out.set(lz4DecompressBlock(r.bytes(comp), uncomp), written);
		written += uncomp;
	}
	if (r.remaining !== 0) throw new Error("pkg: corrupt compressed entry '" + entry.path + "'");
	return out;
}
function readMipmap(r, containerVersion) {
	if (containerVersion === 4) {
		const param1 = r.i32();
		const param2 = r.i32();
		r.nstring(1 << 20);
		const param3 = r.i32();
		if (param1 !== 1 || param2 !== 2 || param3 !== 1) throw new Error("tex: bad TEXB0004 mipmap params");
	}
	const width = r.i32();
	const height = r.i32();
	if (width <= 0 || height <= 0 || width > 16384 || height > 16384) throw new Error("tex: invalid mipmap dimensions " + width + "x" + height);
	if (containerVersion === 1) return {
		width,
		height,
		bytes: r.bytes(r.i32())
	};
	const isLz4 = r.i32() === 1;
	const decompressedCount = r.i32();
	const stored = r.bytes(r.i32());
	if (isLz4) return {
		width,
		height,
		bytes: lz4DecompressBlock(stored, decompressedCount)
	};
	return {
		width,
		height,
		bytes: stored
	};
}
/** Parse a TEX container into metadata plus the first image's mipmaps. */
function parseTexInternal(data) {
	const r = new Reader(data, "tex");
	const magic1 = r.nstring(16);
	if (magic1 !== "TEXV0005") throw new Error("tex: bad magic '" + magic1 + "'");
	const magic2 = r.nstring(16);
	if (magic2 !== "TEXI0001") throw new Error("tex: bad image-info magic '" + magic2 + "'");
	const format = r.i32();
	const flags = r.i32();
	const textureWidth = r.i32();
	const textureHeight = r.i32();
	const imageWidth = r.i32();
	const imageHeight = r.i32();
	r.u32();
	if (TEX_FORMAT_NAMES[format] === void 0) throw new Error("tex: unsupported format " + format);
	const containerMagic = r.nstring(16);
	const containerMatch = /^TEXB000([1-4])$/.exec(containerMagic);
	if (!containerMatch) throw new Error("tex: bad mipmap container magic '" + containerMagic + "'");
	let containerVersion = Number(containerMatch[1]);
	const imageCount = r.i32();
	if (imageCount <= 0 || imageCount > 256) throw new Error("tex: invalid image count " + imageCount);
	let isVideoMp4 = false;
	if (containerVersion === 3) r.i32();
	else if (containerVersion === 4) {
		const freeImageFormat = r.i32();
		isVideoMp4 = r.i32() === 1;
		if (!(freeImageFormat === -1 && isVideoMp4)) containerVersion = 3;
	}
	let firstImage = null;
	for (let i = 0; i < imageCount; i++) {
		const mipmapCount = r.i32();
		if (mipmapCount <= 0 || mipmapCount > 32) throw new Error("tex: invalid mipmap count " + mipmapCount);
		const mipmaps = [];
		for (let j = 0; j < mipmapCount; j++) mipmaps.push(readMipmap(r, containerVersion));
		if (firstImage === null) firstImage = mipmaps;
	}
	const isAnimatedGif = (flags & TEX_FLAG_IS_GIF) !== 0;
	const frames = [];
	if (isAnimatedGif) {
		const frameMagic = r.nstring(16);
		const frameMatch = /^TEXS000([1-3])$/.exec(frameMagic);
		if (!frameMatch) throw new Error("tex: bad frame container magic '" + frameMagic + "'");
		const frameVersion = Number(frameMatch[1]);
		const frameCount = r.i32();
		if (frameCount < 0 || frameCount > 4096) throw new Error("tex: invalid frame count " + frameCount);
		if (frameVersion === 3) {
			r.i32();
			r.i32();
		}
		for (let i = 0; i < frameCount; i++) {
			const imageId = r.i32();
			const frametime = r.f32();
			if (frameVersion === 1) {
				const x = r.i32();
				const y = r.i32();
				const width = r.i32();
				r.i32();
				r.i32();
				const height = r.i32();
				frames.push({
					imageId,
					frametime,
					x,
					y,
					width,
					height
				});
			} else {
				const x = r.f32();
				const y = r.f32();
				const width = r.f32();
				r.f32();
				r.f32();
				const height = r.f32();
				frames.push({
					imageId,
					frametime,
					x,
					y,
					width,
					height
				});
			}
		}
	}
	const mip0 = firstImage[0];
	if (!isVideoMp4 && mip0 && mip0.bytes && mip0.bytes.length >= 8) {
		const b = mip0.bytes;
		if (b[4] === 102 && b[5] === 116 && b[6] === 121 && b[7] === 112 || b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 24 && b[4] === 102 && b[5] === 116 && b[6] === 121 && b[7] === 112) isVideoMp4 = true;
	}
	return {
		format,
		flags,
		width: imageWidth > 0 ? imageWidth : textureWidth > 0 ? textureWidth : mip0.width,
		height: imageHeight > 0 ? imageHeight : textureHeight > 0 ? textureHeight : mip0.height,
		isAnimatedGif,
		isVideoMp4,
		frames,
		mipmaps: firstImage
	};
}
/**
* Parse a TEX container and return its metadata. Animated (gif) and embedded
* MP4 textures are recognized and exposed, never silently dropped.
*/
function parseTex(data) {
	const parsed = parseTexInternal(data);
	const info = {
		width: parsed.width,
		height: parsed.height,
		format: parsed.format,
		formatName: TEX_FORMAT_NAMES[parsed.format] ?? "unknown(" + parsed.format + ")",
		isAnimatedGif: parsed.isAnimatedGif,
		isVideoMp4: parsed.isVideoMp4,
		mipLevels: parsed.mipmaps.length
	};
	if (parsed.isAnimatedGif) info.frames = parsed.frames;
	return info;
}
function rgb565(value) {
	const r = value >> 11 & 31;
	const g = value >> 5 & 63;
	const b = value & 31;
	return [
		r << 3 | r >> 2,
		g << 2 | g >> 4,
		b << 3 | b >> 2
	];
}
/** Build the 4-color BC palette; three-color + transparent when DXT1 c0 <= c1. */
function buildColorPalette(c0, c1, fourColor) {
	const palette = /* @__PURE__ */ new Uint8Array(16);
	const [r0, g0, b0] = rgb565(c0);
	const [r1, g1, b1] = rgb565(c1);
	palette.set([
		r0,
		g0,
		b0,
		255
	], 0);
	palette.set([
		r1,
		g1,
		b1,
		255
	], 4);
	if (fourColor) {
		palette.set([
			(2 * r0 + r1) / 3 | 0,
			(2 * g0 + g1) / 3 | 0,
			(2 * b0 + b1) / 3 | 0,
			255
		], 8);
		palette.set([
			(r0 + 2 * r1) / 3 | 0,
			(g0 + 2 * g1) / 3 | 0,
			(b0 + 2 * b1) / 3 | 0,
			255
		], 12);
	} else {
		palette.set([
			(r0 + r1) / 2 | 0,
			(g0 + g1) / 2 | 0,
			(b0 + b1) / 2 | 0,
			255
		], 8);
		palette.set([
			0,
			0,
			0,
			0
		], 12);
	}
	return palette;
}
/**
* Shared BC1/BC2/BC3 block walker. Color data sits at block base +
* colorOffset; blockStride is 8 (BC1) or 16 (BC2/BC3). dxt1Alpha enables the
* three-color + transparent palette when c0 <= c1.
*/
function decodeColorBlocks(src, out, width, height, blockStride, colorOffset, dxt1Alpha) {
	const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
	const blocksX = Math.ceil(width / 4);
	const blocksY = Math.ceil(height / 4);
	for (let by = 0; by < blocksY; by++) for (let bx = 0; bx < blocksX; bx++) {
		const base = (by * blocksX + bx) * blockStride;
		const c0 = view.getUint16(base + colorOffset, true);
		const c1 = view.getUint16(base + colorOffset + 2, true);
		const palette = buildColorPalette(c0, c1, dxt1Alpha ? c0 > c1 : true);
		const indices = view.getUint32(base + colorOffset + 4, true);
		for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
			const x = bx * 4 + px;
			const y = by * 4 + py;
			if (x >= width || y >= height) continue;
			const selector = indices >> 2 * (py * 4 + px) & 3;
			const dst = (y * width + x) * 4;
			out[dst] = palette[selector * 4];
			out[dst + 1] = palette[selector * 4 + 1];
			out[dst + 2] = palette[selector * 4 + 2];
			out[dst + 3] = palette[selector * 4 + 3];
		}
	}
}
/** BC1 (DXT1): 8-byte blocks, 4x4 pixels, optional 1-bit alpha. */
function decodeDxt1(src, width, height) {
	const out = new Uint8Array(width * height * 4);
	decodeColorBlocks(src, out, width, height, 8, 0, true);
	return out;
}
/** BC2 (DXT3): 16-byte blocks, 4-bit explicit alpha + BC1-style color. */
function decodeDxt3(src, width, height) {
	const out = new Uint8Array(width * height * 4);
	decodeColorBlocks(src, out, width, height, 16, 8, false);
	const view = new DataView(src.buffer, src.byteOffset, src.byteLength);
	const blocksX = Math.ceil(width / 4);
	const blocksY = Math.ceil(height / 4);
	for (let by = 0; by < blocksY; by++) for (let bx = 0; bx < blocksX; bx++) {
		const base = (by * blocksX + bx) * 16;
		const alphaLo = view.getUint32(base, true);
		const alphaHi = view.getUint32(base + 4, true);
		for (let i = 0; i < 16; i++) {
			const x = bx * 4 + i % 4;
			const y = by * 4 + (i / 4 | 0);
			if (x >= width || y >= height) continue;
			const nibble = i < 8 ? alphaLo >> 4 * i & 15 : alphaHi >> 4 * (i - 8) & 15;
			out[(y * width + x) * 4 + 3] = nibble * 17;
		}
	}
	return out;
}
/** BC3 (DXT5): 16-byte blocks, interpolated 3-bit alpha + BC1-style color. */
function decodeDxt5(src, width, height) {
	const out = new Uint8Array(width * height * 4);
	decodeColorBlocks(src, out, width, height, 16, 8, false);
	const blocksX = Math.ceil(width / 4);
	const blocksY = Math.ceil(height / 4);
	for (let by = 0; by < blocksY; by++) for (let bx = 0; bx < blocksX; bx++) {
		const base = (by * blocksX + bx) * 16;
		const a0 = src[base];
		const a1 = src[base + 1];
		const alphas = /* @__PURE__ */ new Uint8Array(8);
		alphas[0] = a0;
		alphas[1] = a1;
		if (a0 > a1) for (let k = 2; k < 8; k++) alphas[k] = ((8 - k) * a0 + (k - 1) * a1) / 7 | 0;
		else {
			for (let k = 2; k < 6; k++) alphas[k] = ((6 - k) * a0 + (k - 2) * a1) / 5 | 0;
			alphas[6] = 0;
			alphas[7] = 255;
		}
		let bits = src[base + 2] + src[base + 3] * 256 + src[base + 4] * 65536 + src[base + 5] * 16777216 + src[base + 6] * 4294967296 + src[base + 7] * 1099511627776;
		for (let i = 0; i < 16; i++) {
			const x = bx * 4 + i % 4;
			const y = by * 4 + (i / 4 | 0);
			const index = bits % 8;
			bits = Math.floor(bits / 8);
			if (x >= width || y >= height) continue;
			out[(y * width + x) * 4 + 3] = alphas[index];
		}
	}
	return out;
}
/**
* Decode the first (largest) mipmap of a TEX container to RGBA8888.
* Supports RGBA8888, R8, RG88 and DXT1/DXT3/DXT5; embedded MP4 textures and
* unknown formats throw a descriptive error instead of failing silently.
*/
function decodeTex(data) {
	const parsed = parseTexInternal(data);
	if (parsed.isVideoMp4) throw new Error("tex: video mp4 textures cannot be decoded to a static frame");
	const { width, height, bytes } = parsed.mipmaps[0];
	switch (parsed.format) {
		case TexFormat.RGBA8888:
			if (bytes.length < width * height * 4) throw new Error("tex: mipmap size mismatch for RGBA8888");
			return {
				width,
				height,
				rgba: bytes.slice(0, width * height * 4)
			};
		case TexFormat.R8: {
			if (bytes.length < width * height) throw new Error("tex: mipmap size mismatch for R8");
			const rgba = new Uint8Array(width * height * 4);
			for (let i = 0; i < width * height; i++) {
				rgba[i * 4] = bytes[i];
				rgba[i * 4 + 1] = bytes[i];
				rgba[i * 4 + 2] = bytes[i];
				rgba[i * 4 + 3] = 255;
			}
			return {
				width,
				height,
				rgba
			};
		}
		case TexFormat.RG88: {
			if (bytes.length < width * height * 2) throw new Error("tex: mipmap size mismatch for RG88");
			const rgba = new Uint8Array(width * height * 4);
			for (let i = 0; i < width * height; i++) {
				rgba[i * 4] = bytes[i * 2];
				rgba[i * 4 + 1] = bytes[i * 2 + 1];
				rgba[i * 4 + 2] = 0;
				rgba[i * 4 + 3] = 255;
			}
			return {
				width,
				height,
				rgba
			};
		}
		case TexFormat.DXT1: {
			const expected = Math.ceil(width / 4) * Math.ceil(height / 4) * 8;
			if (bytes.length < expected) throw new Error("tex: mipmap size mismatch for DXT1");
			return {
				width,
				height,
				rgba: decodeDxt1(bytes, width, height)
			};
		}
		case TexFormat.DXT3: {
			const expected = Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
			if (bytes.length < expected) throw new Error("tex: mipmap size mismatch for DXT3");
			return {
				width,
				height,
				rgba: decodeDxt3(bytes, width, height)
			};
		}
		case TexFormat.DXT5: {
			const expected = Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
			if (bytes.length < expected) throw new Error("tex: mipmap size mismatch for DXT5");
			return {
				width,
				height,
				rgba: decodeDxt5(bytes, width, height)
			};
		}
		default: throw new Error("tex: unsupported format " + parsed.format);
	}
}
const CRC_TABLE = (() => {
	const table = /* @__PURE__ */ new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();
function crc32(bytes) {
	let c = 4294967295;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
	return (c ^ 4294967295) >>> 0;
}
function pngChunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, "ascii");
	out.set(data, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}
/**
* Encode RGBA8888 pixels as a minimal PNG (8-bit RGBA, filter type 0) using
* node:zlib deflate and a hand-rolled CRC32. Zero dependencies.
*/
function encodePng(width, height, rgba) {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("png: invalid dimensions " + width + "x" + height);
	if (rgba.length !== width * height * 4) throw new Error("png: rgba buffer size mismatch");
	const stride = width * 4 + 1;
	const raw = Buffer.alloc(stride * height);
	for (let y = 0; y < height; y++) {
		raw[y * stride] = 0;
		raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	return Buffer.concat([
		Buffer.from([
			137,
			80,
			78,
			71,
			13,
			10,
			26,
			10
		]),
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw, { level: 9 })),
		pngChunk("IEND", Buffer.alloc(0))
	]);
}
/** Extract .tex candidate paths referenced by one scene.json image object. */
function collectImageObjectTextures(imageObject, readJson) {
	const out = [];
	const pushTextureList = (list) => {
		if (!Array.isArray(list)) return;
		for (const item of list) {
			const rawName = typeof item === "string" ? item : item && typeof item === "object" && typeof item.name === "string" ? item.name : item && typeof item === "object" && typeof item.file === "string" ? item.file : null;
			if (!rawName) continue;
			if (rawName.toLowerCase().endsWith(".tex")) out.push(rawName);
			else {
				out.push(rawName + ".tex");
				out.push("materials/" + rawName + ".tex");
			}
		}
	};
	const ref = imageObject.image;
	if (ref.toLowerCase().endsWith(".tex")) out.push(ref);
	else {
		let materialJson = readJson(ref);
		if (materialJson && typeof materialJson.material === "string") {
			const matRef = materialJson.material;
			materialJson = readJson(matRef) ?? readJson("materials/" + matRef);
		}
		if (materialJson && Array.isArray(materialJson.passes)) for (const pass of materialJson.passes) pushTextureList(pass?.textures);
	}
	const instance = imageObject.instance;
	if (instance && typeof instance === "object") pushTextureList(instance.textures);
	return out;
}
/** SceneAccess over a packed scene.pkg container (case-insensitive paths). */
function pkgSceneAccess(pkgData) {
	const entries = parsePkg(pkgData);
	const byPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry]));
	const readFile = (path) => {
		const entry = byPath.get(path.toLowerCase());
		if (!entry) return null;
		return {
			path: entry.path,
			bytes: readPkgEntry(pkgData, entry)
		};
	};
	return {
		readJson: (path) => {
			const file = readFile(path);
			if (!file) return null;
			try {
				return JSON.parse(textDecoder.decode(file.bytes));
			} catch {
				return null;
			}
		},
		readFile,
		listTexPaths: () => entries.filter((entry) => entry.path.toLowerCase().endsWith(".tex")).map((entry) => entry.path)
	};
}
/**
* SceneAccess over a loose scene project directory (scene.json plus loose
* .tex/.json files, e.g. WE defaultprojects). Reads are fenced inside the
* directory; texture references escaping it resolve to null.
*/
function dirSceneAccess(dir) {
	const normDir = resolve(dir);
	const readFile = (path) => {
		const abs = resolve(normDir, path);
		if (abs !== normDir && !abs.startsWith(normDir + sep)) return null;
		try {
			if (!statSync(abs).isFile()) return null;
			return {
				path,
				bytes: new Uint8Array(readFileSync(abs))
			};
		} catch {
			return null;
		}
	};
	const listTexPaths = () => {
		const out = [];
		const walk = (sub, depth) => {
			if (depth > 4) return;
			let names = [];
			try {
				names = readdirSync(sub === "" ? normDir : join(normDir, sub));
			} catch {
				return;
			}
			for (const name of names) {
				const rel = sub === "" ? name : sub + "/" + name;
				let isDir = false;
				let isFile = false;
				try {
					const stat = statSync(join(normDir, rel));
					isDir = stat.isDirectory();
					isFile = stat.isFile();
				} catch {
					continue;
				}
				if (isDir) walk(rel, depth + 1);
				else if (isFile && name.toLowerCase().endsWith(".tex")) out.push(rel);
			}
		};
		walk("", 0);
		return out;
	};
	return {
		readJson: (path) => {
			const file = readFile(path);
			if (!file) return null;
			try {
				return JSON.parse(textDecoder.decode(file.bytes));
			} catch {
				return null;
			}
		},
		readFile,
		listTexPaths
	};
}
function isPngBuffer(buf) {
	return buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71 && buf[4] === 13 && buf[5] === 10 && buf[6] === 26 && buf[7] === 10;
}
function isLikelyMaskOrHelper(path) {
	const lower = path.toLowerCase();
	return lower.includes("/masks/") || lower.includes("_mask") || lower.includes("waterripple") || lower.includes("waterflow") || lower.includes("phase") || lower.includes("normal") || lower.includes("foliagesway") || lower.includes("cursorripple") || lower.includes("赞助") || lower.includes("sponsor") || lower.includes("donate") || lower.includes("qrcode") || lower.includes("qr_code") || lower.includes("audio_bar") || lower.includes("audiobar") || lower.includes("simple_audio") || lower.includes("提示框") || lower.includes("tip") || lower.includes("watermark") || lower.includes("logo") || lower.includes("particle") || lower.includes("audio") || lower.includes("lightmap") || lower.includes("light_map") || lower.includes("visso") || lower.includes("font") || lower.includes("text_");
}
function isNaturalImageRgba(rgba, width, height) {
	const totalPixels = width * height;
	const step = Math.max(1, Math.floor(totalPixels / 2e3));
	let opaqueCount = 0;
	let sampleCount = 0;
	for (let i = 0; i < totalPixels; i += step) {
		sampleCount++;
		if (rgba[i * 4 + 3] >= 240) opaqueCount++;
	}
	return sampleCount > 0 && opaqueCount / sampleCount >= .85;
}
function hasContent(rgba, width, height) {
	const totalPixels = width * height;
	const step = Math.max(1, Math.floor(totalPixels / 1e3));
	let visibleCount = 0;
	let sampleCount = 0;
	for (let i = 0; i < totalPixels; i += step) {
		sampleCount++;
		const idx = i * 4;
		const r = rgba[idx];
		const g = rgba[idx + 1];
		const b = rgba[idx + 2];
		if (rgba[idx + 3] > 10 && (r > 0 || g > 0 || b > 0)) visibleCount++;
	}
	return sampleCount === 0 || visibleCount / sampleCount >= .01;
}
function getTextureScore(path) {
	const lower = path.toLowerCase();
	if (isLikelyMaskOrHelper(path)) return -100;
	let score = 0;
	if (lower.includes("白天") || lower.includes("day") || lower.includes("main") || lower.includes("background") || lower.includes("wallpaper")) score += 50;
	if (lower.includes("清晨") || lower.includes("morning") || lower.includes("黄昏") || lower.includes("dusk")) score += 20;
	if (lower.includes("昼夜变化") || lower.includes("mddn") || lower.includes("transition")) score -= 30;
	return score;
}
/** Shared scene pipeline over one access layer; label prefixes error text. */
function extractSceneMainImageVia(access, label) {
	let scene = access.readJson("scene.json");
	if (!scene) {
		const project = access.readJson("project.json");
		if (project && typeof project.file === "string" && project.file.endsWith(".json")) scene = access.readJson(project.file);
	}
	if (!scene || !Array.isArray(scene.objects)) throw new Error(label + ": scene.json not found or invalid");
	if (scene.objects.some((obj) => obj && typeof obj === "object" && typeof obj.model === "string" && obj.model.length > 0)) throw new Error(label + ": 3D scene cannot be extracted as 2D frame");
	const nonHelperImageObjects = scene.objects.filter((obj) => obj && typeof obj === "object" && typeof obj.image === "string" && !String(obj.image).startsWith("models/util/") && !isLikelyMaskOrHelper(String(obj.image)));
	if (nonHelperImageObjects.length > 3 && !nonHelperImageObjects.some((obj) => {
		const str = String(obj.image).toLowerCase();
		return str.includes("白天") || str.includes("day") || str.includes("night") || str.includes("夜晚");
	})) throw new Error(label + ": multi-layer scene composition requires full preview render");
	const rawCandidates = [];
	for (const obj of scene.objects) if (obj && typeof obj === "object" && typeof obj.image === "string") rawCandidates.push(...collectImageObjectTextures(obj, access.readJson));
	const allCandidates = [];
	for (const p of rawCandidates) if (!isLikelyMaskOrHelper(p) && !allCandidates.some((c) => c.path.toLowerCase() === p.toLowerCase())) allCandidates.push({
		path: p,
		fromObject: true
	});
	for (const p of access.listTexPaths()) if (!isLikelyMaskOrHelper(p) && !allCandidates.some((c) => c.path.toLowerCase() === p.toLowerCase())) allCandidates.push({
		path: p,
		fromObject: false
	});
	const ranked = allCandidates.map(({ path, fromObject }) => {
		let area = 0;
		try {
			const file = access.readFile(path);
			const info = file ? parseTex(file.bytes) : null;
			if (info) area = info.width * info.height;
		} catch {}
		return {
			path,
			score: getTextureScore(path) + (fromObject ? 100 : 0),
			area
		};
	});
	ranked.sort((a, b) => {
		if (a.score !== b.score) return b.score - a.score;
		return b.area - a.area;
	});
	const candidates = ranked.map((r) => r.path);
	if (candidates.length === 0) throw new Error(label + ": no texture candidates found");
	let lastError = null;
	for (const path of candidates) {
		if (isLikelyMaskOrHelper(path)) continue;
		const file = access.readFile(path);
		if (!file) {
			lastError = /* @__PURE__ */ new Error(label + ": texture '" + path + "' not found in " + (label === "pkg" ? "package" : "directory"));
			continue;
		}
		try {
			const parsed = parseTexInternal(file.bytes);
			if (parsed.isVideoMp4) throw new Error("tex: video mp4 textures cannot be decoded to a static frame");
			const mip0 = parsed.mipmaps[0];
			if (isPngBuffer(mip0.bytes)) return {
				width: mip0.width,
				height: mip0.height,
				png: Buffer.from(mip0.bytes),
				texturePath: file.path
			};
			const { width, height, rgba } = decodeTex(file.bytes);
			if (!hasContent(rgba, width, height) || !isNaturalImageRgba(rgba, width, height)) {
				lastError = /* @__PURE__ */ new Error(label + ": texture '" + path + "' is a shader mask or partial layer");
				continue;
			}
			return {
				width,
				height,
				png: encodePng(width, height, rgba),
				texturePath: file.path
			};
		} catch (err) {
			lastError = err;
		}
	}
	throw lastError instanceof Error ? lastError : /* @__PURE__ */ new Error(label + ": no decodable texture found");
}
function extractSceneMainImage(pkgData) {
	return extractSceneMainImageVia(pkgSceneAccess(pkgData), "pkg");
}
/**
* Loose-scene variant of extractSceneMainImage: decode the main texture of a
* scene project directory that ships scene.json and textures as plain files
* instead of a packed scene.pkg (#521).
*/
function extractSceneMainImageFromDir(dir) {
	return extractSceneMainImageVia(dirSceneAccess(dir), "scene");
}
/** Find and extract the primary MP4 video embedded inside a scene's .tex textures. */
function extractSceneVideoVia(access) {
	const candidates = [];
	for (const path of access.listTexPaths()) {
		const file = access.readFile(path);
		if (!file) continue;
		const raw = file.bytes;
		for (let i = 0; i < 200 && i + 8 <= raw.length; i++) if (raw[i] === 102 && raw[i + 1] === 116 && raw[i + 2] === 121 && raw[i + 3] === 112) {
			const ftypOffset = i - 4;
			if (ftypOffset >= 0 && ftypOffset < raw.length) {
				candidates.push({
					path,
					score: getTextureScore(path),
					bytes: raw.slice(ftypOffset)
				});
				break;
			}
		}
	}
	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0].bytes;
}
function extractSceneVideo(pkgData) {
	return extractSceneVideoVia(pkgSceneAccess(pkgData));
}
function extractSceneVideoFromDir(dir) {
	return extractSceneVideoVia(dirSceneAccess(dir));
}
//#endregion
export { extractSceneMainImage, extractSceneMainImageFromDir, extractSceneVideo, extractSceneVideoFromDir };
