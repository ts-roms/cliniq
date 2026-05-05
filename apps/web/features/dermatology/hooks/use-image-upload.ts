'use client';

import { useCallback, useState } from 'react';
import {
  filesControllerConfirm,
  filesControllerPresign,
} from '@org/api-client';

export interface UploadedImage {
  fileId: string;
  filename: string;
  previewUrl: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
}

interface PresignResponse {
  fileId: string;
  uploadUrl: string;
  headers?: Record<string, string>;
}

const MAX_FILES = 8;
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

export function useImageUpload() {
  const [images, setImages] = useState<UploadedImage[]>([]);

  const remove = useCallback((fileId: string) => {
    setImages((prev) => {
      const found = prev.find((img) => img.fileId === fileId);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((img) => img.fileId !== fileId);
    });
  }, []);

  const reset = useCallback(() => {
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  }, []);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      if (images.length >= MAX_FILES) break;
      if (file.size > MAX_SIZE_BYTES) {
        setImages((prev) => [
          ...prev,
          {
            fileId: `local-${Math.random()}`,
            filename: file.name,
            previewUrl: URL.createObjectURL(file),
            status: 'error',
            error: 'File exceeds 8MB.',
          },
        ]);
        continue;
      }

      const placeholderId = `local-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      setImages((prev) => [
        ...prev,
        { fileId: placeholderId, filename: file.name, previewUrl, status: 'uploading' },
      ]);

      try {
        const presigned = await filesControllerPresign({
          body: {
            category: 'CONSULT_ATTACHMENT',
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            isPhi: true,
          },
        });
        if (presigned.error || !presigned.data) {
          throw new Error('Presign failed');
        }
        const presign = presigned.data as unknown as PresignResponse;

        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: presign.headers ?? { 'content-type': file.type },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

        const confirm = await filesControllerConfirm({
          body: { fileId: presign.fileId },
        });
        if (confirm.error) throw new Error('Confirm failed');

        setImages((prev) =>
          prev.map((img) =>
            img.fileId === placeholderId
              ? { ...img, fileId: presign.fileId, status: 'ready' }
              : img,
          ),
        );
      } catch (err) {
        setImages((prev) =>
          prev.map((img) =>
            img.fileId === placeholderId
              ? { ...img, status: 'error', error: (err as Error).message }
              : img,
          ),
        );
      }
    }
  }, [images.length]);

  const readyFileIds = images
    .filter((img) => img.status === 'ready')
    .map((img) => img.fileId);

  return { images, uploadFiles, remove, reset, readyFileIds };
}
