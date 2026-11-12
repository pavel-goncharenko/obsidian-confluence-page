import { describe, expect, it } from 'vitest';
import { sha1Hex, sha1HexOfFile } from '../../src/utils/hash';

describe('sha1Hex', () => {
	it('hashes strings as SHA-1 hex', async () => {
		expect(await sha1Hex('hello')).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
	});

	it('hashes ArrayBuffer input', async () => {
		const bytes = new TextEncoder().encode('hello');
		expect(await sha1Hex(bytes.buffer)).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
	});
});

describe('sha1HexOfFile', () => {
	const enc = (s: string) => new TextEncoder().encode(s).buffer;

	it('ignores line endings in text files', async () => {
		expect(await sha1HexOfFile(enc('a\r\nb\rc'), 'x.drawio.svg')).toBe(await sha1HexOfFile(enc('a\nb\nc'), 'x.drawio.svg'));
	});

	it('keeps bytes of binary files untouched', async () => {
		expect(await sha1HexOfFile(enc('a\r\nb'), 'x.png')).toBe(await sha1Hex(enc('a\r\nb')));
	});
});
