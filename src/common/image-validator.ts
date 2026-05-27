import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

/**
 * Validates a base64 image string and returns the decoded Buffer.
 *
 * Protections:
 *   - Strips the `data:image/jpeg;base64,` prefix if present.
 *   - Caps decoded size (default 5 MB) so an attacker cannot DoS via huge payloads.
 *   - Verifies real PNG / JPEG / WebP magic bytes — base64 strings with the right
 *     MIME prefix but garbage content are rejected.
 *
 * Throws:
 *   - BadRequestException — empty, malformed, or unsupported file type.
 *   - PayloadTooLargeException — file exceeds maxBytes.
 */
export function decodeImageBase64(
  base64: string,
  opts: { maxBytes?: number; label?: string } = {},
): Buffer {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024; // 5 MB default
  const label = opts.label ?? 'image';

  if (!base64 || typeof base64 !== 'string' || base64.length < 20) {
    throw new BadRequestException(`Missing or invalid ${label}`);
  }

  const clean = base64.replace(/^data:image\/\w+;base64,/, '');

  // Base64 → byte length: ~ (length * 3) / 4. Cheap pre-check before allocating.
  const approxBytes = Math.floor((clean.length * 3) / 4);
  if (approxBytes > maxBytes) {
    throw new PayloadTooLargeException(
      `${label} too large (${(approxBytes / 1024 / 1024).toFixed(1)} MB, max ${maxBytes / 1024 / 1024} MB)`,
    );
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(clean, 'base64');
  } catch {
    throw new BadRequestException(`Invalid base64 ${label}`);
  }

  if (bytes.length > maxBytes) {
    throw new PayloadTooLargeException(
      `${label} too large (${(bytes.length / 1024 / 1024).toFixed(1)} MB, max ${maxBytes / 1024 / 1024} MB)`,
    );
  }
  if (bytes.length < 8) {
    throw new BadRequestException(`${label} too small to be valid`);
  }

  // Verify real magic bytes — defends against text/HTML/JS disguised as images.
  if (!isJpeg(bytes) && !isPng(bytes) && !isWebp(bytes)) {
    throw new BadRequestException(
      `${label} must be a JPEG, PNG, or WebP image`,
    );
  }

  return bytes;
}

// JPEG: FF D8 FF
function isJpeg(b: Buffer): boolean {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}
// PNG: 89 50 4E 47 0D 0A 1A 0A
function isPng(b: Buffer): boolean {
  return (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  );
}
// WebP: "RIFF" .... "WEBP"
function isWebp(b: Buffer): boolean {
  return (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  );
}
