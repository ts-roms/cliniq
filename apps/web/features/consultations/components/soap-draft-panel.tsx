'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import type { AiSuggestion } from '../schemas/consultation';
import { AudioRecorder } from './audio-recorder';

interface Props {
  suggestions: AiSuggestion[] | undefined;
  isLoading: boolean;
  isGenerating: boolean;
  isDeciding: boolean;
  disabled: boolean;
  onGenerate: (transcript: string) => void;
  onDecide: (input: {
    suggestionId: string;
    decision: 'ACCEPT' | 'EDIT_ACCEPT' | 'REJECT';
    editedContent?: Record<string, unknown>;
  }) => void;
}

export function SoapDraftPanel({
  suggestions,
  isLoading,
  isGenerating,
  isDeciding,
  disabled,
  onGenerate,
  onDecide,
}: Props) {
  const [transcript, setTranscript] = useState('');

  const pending = suggestions?.find(
    (s) => s.kind === 'SOAP_DRAFT' && s.status === 'PENDING',
  );
  const history = suggestions?.filter((s) => s !== pending) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI scribe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!pending && (
          <TranscriptForm
            transcript={transcript}
            onChange={setTranscript}
            disabled={disabled || isGenerating}
            isGenerating={isGenerating}
            onSubmit={() => onGenerate(transcript)}
          />
        )}

        {pending && (
          <PendingDraft
            suggestion={pending}
            disabled={isDeciding}
            onDecide={onDecide}
          />
        )}

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading suggestions…</p>
        )}

        {history.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              History
            </p>
            {history.map((s) => (
              <SuggestionHistoryRow key={s.id} suggestion={s} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TranscriptForm({
  transcript,
  onChange,
  disabled,
  isGenerating,
  onSubmit,
}: {
  transcript: string;
  onChange: (v: string) => void;
  disabled: boolean;
  isGenerating: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Consultation transcript
      </label>
      <AudioRecorder disabled={disabled} onTranscript={onChange} />
      <textarea
        value={transcript}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="Record audio above, or paste/type the transcript (min 20 chars)…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button
        size="sm"
        disabled={disabled || transcript.length < 20}
        onClick={onSubmit}
      >
        {isGenerating ? 'Generating draft…' : 'Generate SOAP draft'}
      </Button>
    </div>
  );
}

function PendingDraft({
  suggestion,
  disabled,
  onDecide,
}: {
  suggestion: AiSuggestion;
  disabled: boolean;
  onDecide: Props['onDecide'];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Pending review
        </span>
        <span className="text-xs text-muted-foreground">
          {suggestion.model} · {suggestion.promptVersion}
        </span>
      </div>
      <pre className="max-h-72 overflow-auto rounded border bg-muted/30 p-3 text-xs">
        {JSON.stringify(suggestion.draftJson, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onDecide({ suggestionId: suggestion.id, decision: 'ACCEPT' })}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onDecide({
              suggestionId: suggestion.id,
              decision: 'EDIT_ACCEPT',
              editedContent: suggestion.draftJson,
            })
          }
        >
          Accept w/ edits
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onDecide({ suggestionId: suggestion.id, decision: 'REJECT' })}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

function SuggestionHistoryRow({ suggestion: s }: { suggestion: AiSuggestion }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span>
        <span className="font-medium">{s.kind}</span>
        <span className="ml-2 text-muted-foreground">
          {new Date(s.createdAt).toLocaleString()}
        </span>
      </span>
      <span className="text-muted-foreground">{s.status}</span>
    </div>
  );
}
