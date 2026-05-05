import { PortalInvoicesList } from '@/features/portal';

export default function PortalInvoicesPage() {
  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-2xl font-extralight tracking-tight">Invoices</h1>
      <PortalInvoicesList />
    </div>
  );
}
