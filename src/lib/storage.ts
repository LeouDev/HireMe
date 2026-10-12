import { supabase } from './supabase';

export type Bucket = 'public-media' | 'request-files' | 'message-files' | 'verification-docs';

const RULES: Record<Bucket, { types: string[]; maxBytes: number }> = {
  'public-media': { types: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 5 * 1024 * 1024 },
  'request-files': {
    types: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf'],
    maxBytes: 15 * 1024 * 1024,
  },
  'message-files': { types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], maxBytes: 10 * 1024 * 1024 },
  'verification-docs': { types: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 10 * 1024 * 1024 },
};

export const acceptFor = (bucket: Bucket) => RULES[bucket].types.join(',');

/** Detects the real file type from its first bytes instead of trusting the extension. */
export async function sniffMime(file: Blob): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  if (ascii(4, 8) === 'ftyp') return ascii(8, 10) === 'qt' ? 'video/quicktime' : 'video/mp4';
  return null;
}

export async function validateFile(bucket: Bucket, file: File): Promise<string> {
  const rule = RULES[bucket];
  if (file.size > rule.maxBytes) throw new Error(`${file.name} is larger than ${Math.round(rule.maxBytes / 1048576)} MB.`);
  const mime = await sniffMime(file);
  if (!mime || !rule.types.includes(mime)) throw new Error(`${file.name} is not a supported file type.`);
  return mime;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
};

export interface UploadedFile {
  path: string;
  name: string;
  mime: string;
  size: number;
}

/** Uploads under `${folder}/` (the folder is what the storage policies authorize). */
export async function uploadFile(bucket: Bucket, folder: string, file: File): Promise<UploadedFile> {
  const mime = await validateFile(bucket, file);
  const path = `${folder}/${crypto.randomUUID()}.${EXT[mime]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: mime, upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  return { path, name: file.name.slice(0, 200), mime, size: file.size };
}

export function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('public-media').getPublicUrl(path).data.publicUrl;
}

/** Time-limited link for a private file; the request fails unless storage policies allow the viewer. */
export async function signedUrl(bucket: Exclude<Bucket, 'public-media'>, path: string, expiresIn = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
