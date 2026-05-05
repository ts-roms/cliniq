'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { ImageUploader } from './image-uploader';
import { DermDraftView } from './derm-draft-view';
import { useImageUpload } from '../hooks/use-image-upload';
import { useGenerateDermDraft } from '../hooks/use-derm';
import type { DermDraft } from '../schemas/derm';

export function DermatologyPanel({
  consultationId,
}: {
  consultationId: string;
}) {
  const upload = useImageUpload();
  const [complaint, setComplaint] = useState('');
  const generate = useGenerateDermDraft(consultationId);
  const [draft, setDraft] = useState<DermDraft | null>(null);

  const ready = upload.readyFileIds.length;
  const uploading = upload.images.some((img) => img.status === 'uploading');

  const onGenerate = async () => {
    if (ready === 0) return;
    const result = await generate.mutateAsync({
      fileIds: upload.readyFileIds,
      presentingComplaint: complaint || undefined,
    });
    const suggestion = result as unknown as { draft?: DermDraft };
    if (suggestion?.draft) setDraft(suggestion.draft);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dermatology AI</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ImageUploader
          images={upload.images}
          onSelect={upload.uploadFiles}
          onRemove={upload.remove}
          disabled={generate.isPending}
        />

        <FormField label="Presenting complaint">
          <Input
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="e.g. itchy red patch on forearm 5 days"
            maxLength={280}
          />
        </FormField>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {ready} ready · {upload.images.length - ready} pending
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                upload.reset();
                setDraft(null);
              }}
              disabled={generate.isPending}
            >
              Clear
            </Button>
            <Button
              onClick={onGenerate}
              disabled={ready === 0 || uploading || generate.isPending}
            >
              {generate.isPending ? 'Analyzing…' : 'Generate draft'}
            </Button>
          </div>
        </div>

        {generate.error && (
          <p className="text-sm text-destructive">
            {(generate.error as Error).message}
          </p>
        )}

        {draft && <DermDraftView draft={draft} />}
      </CardContent>
    </Card>
  );
}
