'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from '@org/ui';
import {
  obControllerCreateUltrasound,
  obControllerListUltrasounds,
} from '@org/api-client';

type UltrasoundKind =
  | 'OB_2D'
  | 'OB_3D_4D'
  | 'GENERAL_ABDOMINAL'
  | 'GENERAL_PELVIC'
  | 'GENERAL_OTHER';

interface UltrasoundReport {
  id: string;
  kind: UltrasoundKind;
  performedAt: string;
  indication: string | null;
  bpdMm: string | null;
  hcMm: string | null;
  acMm: string | null;
  flMm: string | null;
  estimatedFetalWeightG: number | null;
  amnioticFluidIndexCm: string | null;
  fetalHeartRate: number | null;
  presentation: string | null;
  placentaLocation: string | null;
  fetalSex: string | null;
  findings: string | null;
  impression: string | null;
  files: Array<{ id: string; filename: string; sizeBytes: number }>;
}

const KIND_LABEL: Record<UltrasoundKind, string> = {
  OB_2D: '2D Obstetric',
  OB_3D_4D: '3D / 4D Obstetric',
  GENERAL_ABDOMINAL: 'General Abdominal',
  GENERAL_PELVIC: 'General Pelvic',
  GENERAL_OTHER: 'General (Other)',
};

export function UltrasoundCard({ patientId }: { patientId: string }) {
  const list = useQuery({
    queryKey: ['ultrasound', 'list', patientId],
    queryFn: async (): Promise<UltrasoundReport[]> => {
      const { data, error } = await obControllerListUltrasounds({
        query: { patientId },
      });
      if (error || !data) throw new Error('Failed to load ultrasounds');
      return data as unknown as UltrasoundReport[];
    },
  });
  const [showNew, setShowNew] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Ultrasound</span>
          <Button size="sm" onClick={() => setShowNew((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {showNew ? 'Cancel' : 'New report'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {showNew && <NewReportForm patientId={patientId} onDone={() => setShowNew(false)} />}
        {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {list.error && (
          <p className="text-sm text-destructive">{(list.error as Error).message}</p>
        )}
        {list.data && list.data.length === 0 && !showNew && (
          <p className="text-sm text-muted-foreground">No ultrasound reports yet.</p>
        )}
        {list.data?.map((r) => (
          <ReportRow key={r.id} report={r} />
        ))}
      </CardContent>
    </Card>
  );
}

function ReportRow({ report }: { report: UltrasoundReport }) {
  return (
    <div className="rounded-md border bg-background p-3 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{KIND_LABEL[report.kind]}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(report.performedAt).toLocaleString()}
            {report.indication && ` · ${report.indication}`}
          </div>
        </div>
        {report.files.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {report.files.length} image{report.files.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {(report.bpdMm || report.hcMm || report.acMm || report.flMm) && (
        <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
          {report.bpdMm && <Stat label="BPD" value={`${report.bpdMm} mm`} />}
          {report.hcMm && <Stat label="HC" value={`${report.hcMm} mm`} />}
          {report.acMm && <Stat label="AC" value={`${report.acMm} mm`} />}
          {report.flMm && <Stat label="FL" value={`${report.flMm} mm`} />}
        </div>
      )}
      {(report.estimatedFetalWeightG || report.fetalHeartRate || report.amnioticFluidIndexCm) && (
        <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
          {report.estimatedFetalWeightG && (
            <Stat label="EFW" value={`${report.estimatedFetalWeightG} g`} />
          )}
          {report.fetalHeartRate && <Stat label="FHR" value={`${report.fetalHeartRate} bpm`} />}
          {report.amnioticFluidIndexCm && (
            <Stat label="AFI" value={`${report.amnioticFluidIndexCm} cm`} />
          )}
        </div>
      )}
      {report.impression && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Impression
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{report.impression}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/40 px-2 py-1">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

function NewReportForm({
  patientId,
  onDone,
}: {
  patientId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<UltrasoundKind>('OB_2D');
  const [indication, setIndication] = useState('');
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [bpd, setBpd] = useState('');
  const [efw, setEfw] = useState('');
  const [fhr, setFhr] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await obControllerCreateUltrasound({
        body: {
          patientId,
          kind,
          indication: indication || undefined,
          findings: findings || undefined,
          impression: impression || undefined,
          bpdMm: bpd ? Number(bpd) : undefined,
          estimatedFetalWeightG: efw ? Number(efw) : undefined,
          fetalHeartRate: fhr ? Number(fhr) : undefined,
        } as never,
      });
      if (error) throw new Error('Failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ultrasound'] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="space-y-2 rounded-md border bg-muted/20 p-3"
    >
      <div className="grid gap-2 md:grid-cols-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as UltrasoundKind)}>
          {(Object.keys(KIND_LABEL) as UltrasoundKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <Input
          value={indication}
          onChange={(e) => setIndication(e.target.value)}
          placeholder="Indication (e.g. dating scan, anomaly scan)"
        />
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <Input
          type="number"
          step="0.1"
          value={bpd}
          onChange={(e) => setBpd(e.target.value)}
          placeholder="BPD (mm)"
        />
        <Input
          type="number"
          value={efw}
          onChange={(e) => setEfw(e.target.value)}
          placeholder="EFW (g)"
        />
        <Input
          type="number"
          value={fhr}
          onChange={(e) => setFhr(e.target.value)}
          placeholder="FHR (bpm)"
        />
      </div>
      <textarea
        rows={3}
        value={findings}
        onChange={(e) => setFindings(e.target.value)}
        placeholder="Findings (free-form)"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <textarea
        rows={2}
        value={impression}
        onChange={(e) => setImpression(e.target.value)}
        placeholder="Impression"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={create.isPending}>
          Save report
        </Button>
      </div>
    </form>
  );
}
