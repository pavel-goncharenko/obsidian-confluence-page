import { describe, expect, it } from 'vitest';
import { TFile } from '../helpers/obsidian';
import { MarkdownConverter } from '../../src/confluence/markdownConverter';
import {
	drawioDiagramName,
	drawioPreviewFilename,
	isDrawioSvgFilename,
	parseDrawioSvg,
	renderAcDrawio,
	unwrapDrawioParagraphs,
} from '../../src/confluence/drawio';

const MXFILE = '<mxfile host="Electron"><diagram name="Page-1" id="d1"><mxGraphModel><root><mxCell id="0"/>'
	+ '<mxCell id="a" value="&lt;b&gt;Users&lt;/b&gt; &amp; roles" vertex="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

function encodeAttribute(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function drawioSvg(attrs = 'width="1147px" height="992px" viewBox="0 0 1147 992"'): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs} content="${encodeAttribute(MXFILE)}"><g/></svg>`;
}

describe('draw.io helpers', () => {
	it('recognises .drawio.svg files and derives attachment names', () => {
		expect(isDrawioSvgFilename('Target picture.drawio.svg')).toBe(true);
		expect(isDrawioSvgFilename('plain.svg')).toBe(false);
		expect(drawioDiagramName('Target picture.drawio.svg')).toBe('Target picture');
		expect(drawioPreviewFilename('Target picture')).toBe('Target picture.png');
	});

	it('reads the diagram XML and size from the SVG root element', () => {
		const parsed = parseDrawioSvg(drawioSvg());
		expect(parsed).toEqual({ mxfile: MXFILE, width: 1147, height: 992 });
	});

	it('falls back to the viewBox when width and height are missing', () => {
		const parsed = parseDrawioSvg(drawioSvg('viewBox="0 0 640.5 480"'));
		expect(parsed?.width).toBe(641);
		expect(parsed?.height).toBe(480);
	});

	it('returns null for an SVG without diagram XML', () => {
		expect(parseDrawioSvg('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>')).toBeNull();
		expect(parseDrawioSvg('<svg content="not a diagram"></svg>')).toBeNull();
	});

	it('renders the draw.io macro as the Confluence app stores it', () => {
		const xhtml = renderAcDrawio({ diagramName: 'A & B', revision: 3, diagramWidth: 1147, diagramHeight: 992 });
		expect(xhtml).toBe(
			'<ac:structured-macro ac:name="drawio" ac:schema-version="1">'
			+ '<ac:parameter ac:name="border">true</ac:parameter>'
			+ '<ac:parameter ac:name="diagramName">A &amp; B</ac:parameter>'
			+ '<ac:parameter ac:name="simpleViewer">false</ac:parameter>'
			+ '<ac:parameter ac:name="width" />'
			+ '<ac:parameter ac:name="links">auto</ac:parameter>'
			+ '<ac:parameter ac:name="tbstyle">top</ac:parameter>'
			+ '<ac:parameter ac:name="lbox">true</ac:parameter>'
			+ '<ac:parameter ac:name="diagramWidth">1147</ac:parameter>'
			+ '<ac:parameter ac:name="height">992</ac:parameter>'
			+ '<ac:parameter ac:name="revision">3</ac:parameter>'
			+ '</ac:structured-macro>',
		);
	});

	it('removes the paragraph wrapper around a standalone macro only', () => {
		const macro = renderAcDrawio({ diagramName: 'd', revision: 1 });
		expect(unwrapDrawioParagraphs(`<p>${macro}</p>`)).toBe(macro);
		expect(unwrapDrawioParagraphs('<p>text</p>')).toBe('<p>text</p>');
	});
});

describe('MarkdownConverter with draw.io embeds', () => {
	const files = [new TFile('_attachments/Target picture.drawio.svg'), new TFile('_attachments/photo.png')];
	const app = {
		metadataCache: {
			getFirstLinkpathDest: (linkpath: string) => files.find((file) => file.name === linkpath || file.path === linkpath) ?? null,
			getFileCache: () => ({ frontmatter: undefined }),
		},
		vault: { getFiles: () => files },
	} as never;

	it('renders a published diagram as the draw.io macro and other images as before', async () => {
		const converter = new MarkdownConverter(app);
		const markdown = 'Before\n\n![[Target picture.drawio.svg]]\n\n![[photo.png]]\n\nAfter';
		const html = await converter.convert(markdown, 'note.md', {
			attachedFilenames: new Set(['photo.png']),
			mermaidFilenameByHash: new Map(),
			plantUmlFilenameByHash: new Map(),
			drawioMacros: new Map([['Target picture.drawio.svg', { diagramName: 'Target picture', revision: 2, diagramWidth: 1147, diagramHeight: 992 }]]),
			renderMermaidToPng: false,
			renderPlantUmlToPng: false,
		});

		expect(html).toContain('<p>Before</p>\n<ac:structured-macro ac:name="drawio"');
		expect(html).toContain('<ac:parameter ac:name="diagramName">Target picture</ac:parameter>');
		expect(html).toContain('<ac:parameter ac:name="revision">2</ac:parameter>');
		expect(html).toContain('<ri:attachment ri:filename="photo.png" />');
		expect(html).not.toContain('Target picture.drawio.svg');
	});

	it('passes a width from the embed to the macro', async () => {
		const converter = new MarkdownConverter(app);
		const html = await converter.convert('![[Target picture.drawio.svg|cpp-w-600]]', 'note.md', {
			attachedFilenames: new Set<string>(),
			mermaidFilenameByHash: new Map(),
			plantUmlFilenameByHash: new Map(),
			drawioMacros: new Map([['Target picture.drawio.svg', { diagramName: 'Target picture', revision: 1 }]]),
			renderMermaidToPng: false,
			renderPlantUmlToPng: false,
		});

		expect(html).toContain('<ac:parameter ac:name="width">600</ac:parameter>');
	});
});
