/**
 * draw.io support: an embedded `*.drawio.svg` (the editable SVG format saved by the Obsidian draw.io plugin and
 * by draw.io desktop) is published as a native draw.io macro instead of a flat image.
 *
 * The draw.io app for Confluence stores a diagram as two page attachments and one macro:
 * - `<diagramName>`      — the diagram XML (`<mxfile>…`), media type `application/vnd.jgraph.mxfile`;
 * - `<diagramName>.png`  — the preview image shown on the page and in exports;
 * - `<ac:structured-macro ac:name="drawio">` with `diagramName` and `revision` (the XML attachment version).
 *
 * A `.drawio.svg` file carries the same XML in the `content` attribute of its root `<svg>` element, so the
 * publisher can produce all three without running draw.io.
 */

export const DRAWIO_MIME = 'application/vnd.jgraph.mxfile';

const DRAWIO_SVG_RE = /\.drawio\.svg$/i;

export interface DrawioSvg {
	/** Diagram XML, starting with `<mxfile`. */
	mxfile: string;
	/** Rendered size of the SVG in CSS pixels, when the root element declares it. */
	width?: number;
	height?: number;
}

export interface DrawioMacro {
	diagramName: string;
	/** Version number of the diagram XML attachment. */
	revision: number;
	/** Native diagram size, used by the macro for layout before the viewer loads. */
	diagramWidth?: number;
	diagramHeight?: number;
	/** Optional display width requested in the embed (`![[x.drawio.svg|cpp-w-600]]`). */
	width?: string;
}

export function isDrawioSvgFilename(filename: string): boolean {
	return DRAWIO_SVG_RE.test(filename);
}

/** `Target picture.drawio.svg` → `Target picture`: the attachment name draw.io itself would use. */
export function drawioDiagramName(filename: string): string {
	return filename.replace(DRAWIO_SVG_RE, '');
}

export function drawioPreviewFilename(diagramName: string): string {
	return `${diagramName}.png`;
}

/** Reads the diagram XML and size from a `.drawio.svg` file. Returns null when the SVG carries no diagram. */
export function parseDrawioSvg(svgText: string): DrawioSvg | null {
	const rootTag = svgText.match(/<svg\b[^>]*>/i)?.[0];
	if (!rootTag) return null;

	const content = readAttribute(rootTag, 'content');
	if (!content) return null;
	const mxfile = decodeXmlEntities(content).trim();
	if (!mxfile.startsWith('<mxfile')) return null;

	const size = readSvgSize(rootTag);
	return { mxfile, ...size };
}

export function renderAcDrawio(macro: DrawioMacro): string {
	const params: Array<[string, string]> = [
		['border', 'true'],
		['diagramName', macro.diagramName],
		['simpleViewer', 'false'],
		['width', macro.width ?? ''],
		['links', 'auto'],
		['tbstyle', 'top'],
		['lbox', 'true'],
		['diagramWidth', macro.diagramWidth ? String(macro.diagramWidth) : ''],
		['height', macro.diagramHeight ? String(macro.diagramHeight) : ''],
		['revision', String(macro.revision)],
	];
	const body = params
		.map(([name, value]) => (value
			? `<ac:parameter ac:name="${name}">${escapeText(value)}</ac:parameter>`
			: `<ac:parameter ac:name="${name}" />`))
		.join('');
	return `<ac:structured-macro ac:name="drawio" ac:schema-version="1">${body}</ac:structured-macro>`;
}

/**
 * markdown-it wraps a standalone image line in `<p>`. The draw.io macro is a block macro, so the wrapper is
 * removed when the paragraph holds nothing else.
 */
export function unwrapDrawioParagraphs(html: string): string {
	return html.replace(
		/<p>\s*(<ac:structured-macro ac:name="drawio"[\s\S]*?<\/ac:structured-macro>)\s*<\/p>/g,
		'$1',
	);
}

/**
 * Rasterizes the SVG to PNG in the renderer process (Obsidian is Electron, so Image and canvas are available).
 * Returns null outside a browser environment or when the browser refuses to export the canvas.
 */
export async function rasterizeSvgToPng(svgText: string, width: number, height: number, scale = 1): Promise<ArrayBuffer | null> {
	if (typeof document === 'undefined' || typeof Image === 'undefined') return null;

	const image = new Image();
	const loaded = new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('The SVG could not be loaded as an image'));
	});
	image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
	await loaded;

	const canvas = createEl('canvas');
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	const context = canvas.getContext('2d');
	if (!context) return null;
	context.fillStyle = '#ffffff';
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.drawImage(image, 0, 0, canvas.width, canvas.height);

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	return blob ? blob.arrayBuffer() : null;
}

function readAttribute(tag: string, name: string): string | null {
	const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
	if (!match) return null;
	return match[1] ?? match[2] ?? null;
}

function readSvgSize(rootTag: string): { width?: number; height?: number } {
	const width = parseLength(readAttribute(rootTag, 'width'));
	const height = parseLength(readAttribute(rootTag, 'height'));
	if (width && height) return { width, height };

	const viewBox = readAttribute(rootTag, 'viewBox')?.trim().split(/[\s,]+/).map(Number);
	if (viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite)) {
		return { width: Math.ceil(viewBox[2]!), height: Math.ceil(viewBox[3]!) };
	}
	return {};
}

function parseLength(value: string | null): number | undefined {
	if (!value) return undefined;
	const match = value.trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
	return match ? Math.ceil(Number(match[1])) : undefined;
}

function decodeXmlEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (_full, entity: string) => {
		const lower = entity.toLowerCase();
		if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
		if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
		switch (lower) {
			case 'lt': return '<';
			case 'gt': return '>';
			case 'quot': return '"';
			case 'apos': return '\'';
			default: return '&';
		}
	});
}

function escapeText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
