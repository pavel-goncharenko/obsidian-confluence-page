/**
 * Cross-platform sha1 hex encoding.
 * Uses Web Crypto API from the current runtime.
 */
export async function sha1Hex(input: ArrayBuffer | string): Promise<string> {
    const data = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
    const subtle = crypto?.subtle;
    if (subtle?.digest) {
        const buf = await subtle.digest('SHA-1', data);
        return toHex(new Uint8Array(buf));
    }
    throw new Error('crypto.subtle is unavailable');
}

const TEXT_FILE = /\.(svg|drawio|xml|txt|md|json|ya?ml|csv)$/i;

/** sha1 of a vault file; text files are hashed with CRLF/CR folded to LF so line endings never change the hash. */
export async function sha1HexOfFile(bytes: ArrayBuffer, filename: string): Promise<string> {
    if (TEXT_FILE.test(filename)) {
        const text = new TextDecoder().decode(bytes);
        if (text.includes('\r')) return sha1Hex(text.replace(/\r\n?/g, '\n'));
    }
    return sha1Hex(bytes);
}

function toHex(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]!;
        s += (b < 16 ? '0' : '') + b.toString(16);
    }
    return s;
}
