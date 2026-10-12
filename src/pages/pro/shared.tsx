import { useQuery } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Spinner, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { acceptFor, publicUrl, uploadFile } from '@/lib/storage';
import { supabase, unwrap } from '@/lib/supabase';

// Helpers shared by the professional dashboard pages.

export const proPageUrl = (slug: string) => `${env.appUrl}/pro/${slug}`;

export function useCategories() {
  return useQuery({
    queryKey: ['pro-pages', 'categories'],
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await supabase.from('service_categories').select('id, name, slug').order('sort_order')) ?? [],
  });
}

export function useCopyLink() {
  const toast = useToast();
  return async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Could not copy the link. Select and copy it manually.', 'error');
    }
  };
}

interface ImageUploaderProps {
  label: string;
  value: string[];
  onChange: (paths: string[]) => void;
  /** With max = 1 a new upload replaces the current image. */
  max: number;
  hint?: string;
  error?: string;
  thumbClassName?: string;
}

/**
 * Uploads images to the public-media bucket under the caller's folder and returns storage paths.
 * Removed images are only unlinked, not deleted, so cancelling a form never breaks a saved record.
 */
export function ImageUploader({ label, value, onChange, max, hint, error, thumbClassName = 'aspect-square' }: ImageUploaderProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const replace = max === 1;
  const room = replace ? 1 : max - value.length;

  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length || !user) return;
    setUploadError(null);
    if (files.length > room) {
      setUploadError(room > 0 ? `You can add ${room} more image${room === 1 ? '' : 's'}.` : `You can upload up to ${max} images.`);
      return;
    }
    setBusy(true);
    const results = await Promise.allSettled(files.map((f) => uploadFile('public-media', user.id, f)));
    setBusy(false);
    const paths = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.path] : []));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) setUploadError(errorMessage(failed.reason, 'Upload failed. Try again.'));
    if (paths.length) onChange(replace ? paths.slice(0, 1) : [...value, ...paths]);
  };

  const message = uploadError ?? error;
  return (
    <div>
      <p className="label">{label}</p>
      <ul className={`grid gap-3 ${replace ? 'grid-cols-1' : 'grid-cols-3 sm:grid-cols-4'}`}>
        {value.map((path, i) => (
          <li key={path} className={`relative overflow-hidden rounded-lg border border-ink-200 bg-ink-50 ${thumbClassName}`}>
            <img src={publicUrl(path) ?? ''} alt={`${label} ${i + 1}`} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((p) => p !== path))}
              disabled={busy}
              className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-ink-950/80 text-white hover:bg-ink-950"
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
        {(replace ? value.length === 0 : room > 0) ? (
          <li className={thumbClassName}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex size-full min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-300 text-[13px] text-ink-600 hover:border-ink-500 hover:bg-ink-50 disabled:opacity-60"
            >
              {busy ? <Spinner className="size-5" /> : <ImagePlus className="size-5" aria-hidden="true" />}
              {busy ? 'Uploading…' : `Add ${replace ? 'image' : 'images'}`}
            </button>
          </li>
        ) : null}
      </ul>
      {replace && value.length > 0 && (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="mt-2 text-[13px] font-medium text-ink-900 underline underline-offset-4 disabled:opacity-60">
          {busy ? 'Uploading…' : 'Replace image'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={acceptFor('public-media')}
        multiple={!replace}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => add(e.target.files)}
      />
      {message ? (
        <p role="alert" className="mt-1.5 text-[13px] text-danger-600">{message}</p>
      ) : (
        <p className="mt-1.5 text-[13px] text-ink-500">{hint ?? `JPG, PNG or WebP, up to 5 MB each.${replace ? '' : ` Up to ${max} images.`}`}</p>
      )}
    </div>
  );
}
