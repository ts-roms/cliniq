'use client';

import { useRef } from 'react';
import { Button } from '@org/ui';
import type { UploadedImage } from '../hooks/use-image-upload';

const STATUS_TONE = {
  uploading: 'bg-amber-100 text-amber-800',
  ready: 'bg-emerald-100 text-emerald-800',
  error: 'bg-rose-100 text-rose-800',
} as const;

export function ImageUploader({
  images,
  onSelect,
  onRemove,
  disabled,
}: {
  images: UploadedImage[];
  onSelect: (files: FileList) => void;
  onRemove: (fileId: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onSelect(e.target.files);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || images.length >= 8}
        onClick={() => inputRef.current?.click()}
      >
        Add photos ({images.length}/8)
      </Button>

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <li
              key={img.fileId}
              className="group relative overflow-hidden rounded border bg-card"
            >
              <img
                src={img.previewUrl}
                alt={img.filename}
                className="h-32 w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 ${STATUS_TONE[img.status]}`}
                >
                  {img.status}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(img.fileId)}
                  className="text-destructive hover:underline"
                >
                  remove
                </button>
              </div>
              {img.error && (
                <p className="px-2 pb-1 text-xs text-destructive">{img.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
