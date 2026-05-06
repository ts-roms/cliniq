'use client';

import { useState } from 'react';
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
import { FormField } from '@/shared/components/forms/form-field';
import {
  useCreateProduct,
  useLabProducts,
  useUpdateProduct,
  type labApi,
} from '@/features/lab';
import type { LabProductPricingMode } from '@/features/lab';

export default function LabCatalogPage() {
  const { data, isLoading, error } = useLabProducts();
  const create = useCreateProduct();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Products clinics can request from your lab.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          {showForm ? 'Hide form' : 'New product'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New product</CardTitle>
          </CardHeader>
          <CardContent>
            <NewProductForm
              onCancel={() => setShowForm(false)}
              onCreated={() => setShowForm(false)}
              create={create}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No products yet. Add your first one with the button above.
            </p>
          )}

          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">SKU</th>
                    <th className="py-2 pr-3">Pricing</th>
                    <th className="py-2 pr-3">Price</th>
                    <th className="py-2 pr-3">Phases</th>
                    <th className="py-2 pr-3">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <ProductRow key={p.id} product={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewProductForm({
  create,
  onCancel,
  onCreated,
}: {
  create: ReturnType<typeof useCreateProduct>;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [pricingMode, setPricingMode] = useState<LabProductPricingMode>('FIXED');
  const [defaultPriceMajor, setDefaultPriceMajor] = useState<string>('');
  const [phases, setPhases] = useState<string>('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceCentavos = defaultPriceMajor
      ? Math.round(parseFloat(defaultPriceMajor) * 100)
      : undefined;
    create.mutate(
      {
        name,
        sku: sku || undefined,
        pricingMode,
        defaultPrice: pricingMode === 'ADJUST_ON_ORDER' ? undefined : priceCentavos,
        phases: phases.split(',').map((s) => s.trim()).filter(Boolean),
      },
      { onSuccess: onCreated },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Name">
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Zirconia crown — anatomical"
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="SKU (optional)">
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="ZA-CR-001" />
        </FormField>

        <FormField label="Pricing mode">
          <Select
            value={pricingMode}
            onChange={(e) => setPricingMode(e.target.value as LabProductPricingMode)}
          >
            <option value="FIXED">Fixed</option>
            <option value="ADJUST_ON_ORDER">Adjust on order</option>
            <option value="PER_RATE_PROFILE">Per rate profile (Phase 4)</option>
            <option value="VARIABLE_PER_TIER">Variable per tier (Phase 4)</option>
          </Select>
        </FormField>
      </div>

      {pricingMode !== 'ADJUST_ON_ORDER' && (
        <FormField label="Default price (₱)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={defaultPriceMajor}
            onChange={(e) => setDefaultPriceMajor(e.target.value)}
            placeholder="4500"
          />
          <p className="text-[11px] text-muted-foreground">
            Stored in centavos internally; enter major units here.
          </p>
        </FormField>
      )}

      <FormField label="Manufacturing phases (comma-separated)">
        <Input
          value={phases}
          onChange={(e) => setPhases(e.target.value)}
          placeholder="design, milling, glaze, qc"
        />
      </FormField>

      {create.error && (
        <p className="text-sm text-destructive">{(create.error as Error).message}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}

function ProductRow({ product }: { product: labApi.LabProductSummary }) {
  const update = useUpdateProduct(product.id);
  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="py-2 pr-3 font-medium">{product.name}</td>
      <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
        {product.sku ?? '—'}
      </td>
      <td className="py-2 pr-3 text-xs uppercase tracking-wider text-muted-foreground">
        {product.pricingMode.replace(/_/g, ' ')}
      </td>
      <td className="py-2 pr-3 tabular-nums">
        {product.defaultPrice
          ? `₱${(product.defaultPrice / 100).toLocaleString()}`
          : '—'}
      </td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {product.phases.length > 0 ? product.phases.join(' → ') : '—'}
      </td>
      <td className="py-2 pr-3">
        <Button
          variant={product.isActive ? 'outline' : 'default'}
          size="sm"
          disabled={update.isPending}
          onClick={() => update.mutate({ isActive: !product.isActive })}
        >
          {product.isActive ? 'Active' : 'Inactive'}
        </Button>
      </td>
    </tr>
  );
}
