'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  useCreateMaterial,
  useCreateMaterialLot,
  useDeleteMaterial,
  useMaterialLots,
  useMaterials,
  useUpdateMaterialLot,
  type LabMaterial,
  type LabMaterialLotStatus,
} from '@/features/lab';

const LOT_STATUSES: LabMaterialLotStatus[] = [
  'ACTIVE',
  'WAREHOUSE',
  'FINISHED',
  'DEFECTIVE',
  'EXPIRED',
];

const STATUS_COLOR: Record<LabMaterialLotStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  WAREHOUSE: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  FINISHED: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
  DEFECTIVE: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  EXPIRED: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

export default function LabMaterialsPage() {
  const { data, isLoading, error } = useMaterials();
  const create = useCreateMaterial();
  const remove = useDeleteMaterial();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [uom, setUom] = useState('g');
  const [supplier, setSupplier] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        name,
        sku: sku || undefined,
        category: category || undefined,
        unitOfMeasure: uom,
        defaultSupplier: supplier || undefined,
      },
      {
        onSuccess: () => {
          setName('');
          setSku('');
          setCategory('');
          setUom('g');
          setSupplier('');
          setShowForm(false);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Materials</h1>
          <p className="text-sm text-muted-foreground">
            Inventory + LOT traceability for materials consumed during manufacturing.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          {showForm ? 'Hide form' : 'New material'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New material</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <FormField label="Name">
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Zirconia disc (Translucent)"
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="SKU (optional)">
                  <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="ZR-DISC-T" />
                </FormField>
                <FormField label="Category">
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="CAD/CAM blocks"
                  />
                </FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Unit of measure">
                  <Select value={uom} onChange={(e) => setUom(e.target.value)}>
                    <option value="g">g (grams)</option>
                    <option value="ml">ml</option>
                    <option value="cc">cc</option>
                    <option value="pcs">pcs</option>
                    <option value="kg">kg</option>
                    <option value="m">m</option>
                  </Select>
                </FormField>
                <FormField label="Default supplier">
                  <Input
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="e.g. Vita Zahnfabrik"
                  />
                </FormField>
              </div>
              {create.error && (
                <p className="text-sm text-destructive">
                  {(create.error as Error).message}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      )}
      {data && data.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">No materials yet.</p>
      )}

      <div className="space-y-3">
        {data?.map((m) => (
          <MaterialRow key={m.id} material={m} onDelete={() => remove.mutate(m.id)} />
        ))}
      </div>
    </div>
  );
}

function MaterialRow({
  material,
  onDelete,
}: {
  material: LabMaterial;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const activeLots = (material.lots ?? []).filter((l) => l.status === 'ACTIVE');
  const totalRemaining = activeLots.reduce((s, l) => s + l.remainingQty, 0);
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
            <div>
              <div className="font-medium">{material.name}</div>
              <div className="text-xs text-muted-foreground">
                {material.category ?? 'Uncategorized'} · {material.unitOfMeasure}
                {material.sku && ` · SKU ${material.sku}`}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {activeLots.length} active LOT{activeLots.length === 1 ? '' : 's'}
              {totalRemaining > 0 && (
                <>
                  {' · '}
                  <span className="font-medium text-foreground">
                    {totalRemaining} {material.unitOfMeasure}
                  </span>{' '}
                  remaining
                </>
              )}
            </span>
            <button
              type="button"
              onClick={onDelete}
              className="text-muted-foreground/60 hover:text-destructive"
              aria-label="Delete material"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {open && <LotsPanel material={material} />}
      </CardContent>
    </Card>
  );
}

function LotsPanel({ material }: { material: LabMaterial }) {
  const { data: lots, isLoading } = useMaterialLots(material.id);
  const create = useCreateMaterialLot(material.id);
  const update = useUpdateMaterialLot(material.id);

  const [show, setShow] = useState(false);
  const [lotNumber, setLotNumber] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [initialQty, setInitialQty] = useState('');
  const [expires, setExpires] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        lotNumber,
        manufacturer: manufacturer || undefined,
        supplier: supplier || undefined,
        initialQty: parseFloat(initialQty),
        expiresAt: expires ? new Date(expires).toISOString() : undefined,
      },
      {
        onSuccess: () => {
          setLotNumber('');
          setManufacturer('');
          setSupplier('');
          setInitialQty('');
          setExpires('');
          setShow(false);
        },
      },
    );
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          LOTs
        </span>
        <Button size="sm" variant="outline" onClick={() => setShow((v) => !v)}>
          <Plus className="mr-1 h-3 w-3" aria-hidden />
          {show ? 'Cancel' : 'Receive LOT'}
        </Button>
      </div>

      {show && (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="LOT number">
              <Input
                required
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="ZR-2024-0042"
              />
            </FormField>
            <FormField label={`Initial qty (${material.unitOfMeasure})`}>
              <Input
                required
                type="number"
                step="0.01"
                min={0}
                value={initialQty}
                onChange={(e) => setInitialQty(e.target.value)}
                placeholder="500"
              />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Manufacturer">
              <Input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="Vita"
              />
            </FormField>
            <FormField label="Supplier">
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder={material.defaultSupplier ?? ''}
              />
            </FormField>
          </div>
          <FormField label="Expires (optional)">
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </FormField>
          {create.error && (
            <p className="text-sm text-destructive">
              {(create.error as Error).message}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add LOT'}
            </Button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Loading LOTs…</p>}

      {lots && lots.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">LOT</th>
                <th className="py-2 pr-3">Manufacturer / supplier</th>
                <th className="py-2 pr-3">Remaining</th>
                <th className="py-2 pr-3">Expires</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">{l.lotNumber}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {l.manufacturer ?? '—'}
                    {l.supplier && ` · ${l.supplier}`}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {l.remainingQty} / {l.initialQty} {material.unitOfMeasure}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {l.expiresAt
                      ? new Date(l.expiresAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <Select
                      value={l.status}
                      onChange={(e) =>
                        update.mutate({
                          lotId: l.id,
                          status: e.target.value as LabMaterialLotStatus,
                        })
                      }
                      className="w-32 text-xs"
                    >
                      {LOT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[l.status]}`}
                    >
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
