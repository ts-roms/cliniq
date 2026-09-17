import { useState } from 'react';
import { ActivityIndicator, SafeAreaView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { client, configureAuth, configureAutoRefresh } from '@org/api-client';
import { LoginScreen } from '../features/auth/login-screen';
import { useSession } from '../features/auth/use-session';
import { useHydrated } from '../features/auth/use-hydrated';
import { clearSession, getSession, saveSession } from '../features/auth/session';
import { PatientsScreen } from '../features/patients/patients-screen';
import { PatientDetailScreen } from '../features/patients/patient-detail-screen';
import { ScheduleScreen } from '../features/appointments/schedule-screen';
import { ConsultDetailScreen } from '../features/consultations/consult-detail-screen';
import {
  NotificationsScreen,
  useUnreadCount,
} from '../features/notifications/notifications-screen';
import { usePushNotifications } from '../features/notifications/use-push-notifications';
import { PortalHomeScreen } from '../features/portal/portal-home-screen';
import { PortalAppointmentsScreen } from '../features/portal/portal-appointments-screen';
import { PortalRecordsScreen } from '../features/portal/portal-records-screen';
import { PortalInvoicesScreen } from '../features/portal/portal-invoices-screen';
import { LabInboxScreen } from '../features/lab/lab-inbox-screen';
import { LabCaseDetailScreen } from '../features/lab/lab-case-detail-screen';
import { LabInvoiceDetailScreen } from '../features/lab/lab-invoice-detail-screen';
import { LabTreatmentPlansScreen } from '../features/lab/lab-treatment-plans-screen';
import { TabBar, type Tab } from '../shared/components/tab-bar';
import { NavRail } from '../shared/components/nav-rail';
import { LangSwitch } from '../shared/components/lang-switch';
import { useBreakpoint, useResponsiveValue } from '../shared/hooks/use-breakpoint';
import { useT } from '../shared/i18n';

// Configure the API client once at module load. process.env on RN is statically
// inlined at build time by Expo when prefixed with EXPO_PUBLIC_.
client.setConfig({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
});
configureAuth(() => getSession()?.accessToken ?? null);
configureAutoRefresh({
  getRefreshToken: () => getSession()?.refreshToken ?? null,
  onRefreshed: ({ accessToken, refreshToken }) => {
    const current = getSession();
    if (!current) return;
    saveSession({ ...current, accessToken, refreshToken });
  },
  onRefreshFailed: () => {
    clearSession();
  },
});

type StaffTabKey = 'patients' | 'schedule' | 'lab' | 'inbox';
type PortalTabKey = 'home' | 'appointments' | 'records' | 'invoices';

export const App = () => {
  // Hold the QueryClient in component state so it's stable across re-renders
  // (matches the web's pattern in apps/web/app/providers.tsx).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaView className="flex-1 bg-background" testID="root">
        {/* eslint-disable-next-line react/style-prop-object */}
        <StatusBar style="dark" />
        <Router />
      </SafeAreaView>
    </QueryClientProvider>
  );
};

/**
 * Session-driven router. Waits for AsyncStorage hydration so already-logged-in
 * users don't flash the LoginScreen on cold start. Branches on role: PATIENT
 * sees the portal shell (4 tabs), staff (everyone else) see the clinical shell.
 */
function Router() {
  const hydrated = useHydrated();
  const session = useSession();
  // Register/unregister the device's Expo push token whenever the session
  // changes. Self-gating: hook handles unauthenticated state internally.
  usePushNotifications();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!session) return <LoginScreen />;
  if (session.user.role === 'PATIENT') return <PortalShell />;
  return <StaffShell />;
}

/**
 * Responsive shell — chrome flips at three breakpoints:
 *   xs/sm/md (<768)   bottom tab bar (current phone behavior)
 *   lg       (>=768)  compact left rail (icons stacked over labels)
 *   xl       (>=1024) expanded left rail (icons beside full-width labels)
 * The same `tabs` definition feeds all three.
 */
function ResponsiveShell<T extends string>({
  tabs,
  active,
  onChange,
  brand,
  children,
}: {
  tabs: Tab<T>[];
  active: T;
  onChange: (next: T) => void;
  brand: string;
  children: React.ReactNode;
}) {
  const { isTablet, isWide } = useBreakpoint();
  // Match the rail variant; on `xl` the content also gets a wider cap and
  // generous gutter, on `lg` it's tighter.
  const contentMaxClass = useResponsiveValue({
    xs: 'w-full',
    lg: 'mx-auto w-full max-w-3xl',
    xl: 'mx-auto w-full max-w-5xl',
  }) ?? 'w-full';
  const contentPad = useResponsiveValue({ xs: '', lg: 'px-4', xl: 'px-6' }) ?? '';

  if (isTablet) {
    return (
      <View className="flex-1 flex-row">
        <NavRail
          tabs={tabs}
          active={active}
          onChange={onChange}
          brand={brand}
          variant={isWide ? 'expanded' : 'compact'}
        />
        <View className="flex-1">
          <View className={`flex-1 ${contentMaxClass} ${contentPad}`}>{children}</View>
          <ShellFooter />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="flex-1">{children}</View>
      <ShellFooter />
      <TabBar tabs={tabs} active={active} onChange={onChange} />
    </View>
  );
}

function StaffShell() {
  const [tab, setTab] = useState<StaffTabKey>('patients');
  const [patientDetailId, setPatientDetailId] = useState<string | null>(null);
  const [consultDetailId, setConsultDetailId] = useState<string | null>(null);
  // Lab navigation state — three nullable ids stand in for the screen stack.
  // Mutually exclusive: at most one is set at a time. Keeps the navigation
  // simple without pulling in react-navigation just for four screens.
  const [labCaseId, setLabCaseId] = useState<string | null>(null);
  const [labInvoiceId, setLabInvoiceId] = useState<string | null>(null);
  const [labPlansForCaseId, setLabPlansForCaseId] = useState<string | null>(null);
  const unread = useUnreadCount();
  const t = useT();

  const tabs: Tab<StaffTabKey>[] = [
    { key: 'patients', label: t('tabs.patients'), icon: 'users' },
    { key: 'schedule', label: t('tabs.schedule'), icon: 'calendar' },
    { key: 'lab', label: t('tabs.lab'), icon: 'package' },
    { key: 'inbox', label: t('tabs.inbox'), badge: unread.data ?? 0, icon: 'bell' },
  ];

  return (
    <ResponsiveShell tabs={tabs} active={tab} onChange={setTab} brand={t('app.brand')}>
      {tab === 'patients' &&
        (consultDetailId ? (
          <ConsultDetailScreen
            consultId={consultDetailId}
            onBack={() => setConsultDetailId(null)}
          />
        ) : patientDetailId ? (
          <PatientDetailScreen
            patientId={patientDetailId}
            onBack={() => setPatientDetailId(null)}
            onSelectConsult={setConsultDetailId}
          />
        ) : (
          <PatientsScreen onSelect={setPatientDetailId} />
        ))}
      {tab === 'schedule' && <ScheduleScreen />}
      {tab === 'lab' &&
        (labPlansForCaseId ? (
          <LabTreatmentPlansScreen
            caseId={labPlansForCaseId}
            onBack={() => setLabPlansForCaseId(null)}
          />
        ) : labCaseId ? (
          <LabCaseDetailScreen
            caseId={labCaseId}
            onBack={() => setLabCaseId(null)}
            onViewPlans={() => {
              setLabPlansForCaseId(labCaseId);
              setLabCaseId(null);
            }}
          />
        ) : labInvoiceId ? (
          <LabInvoiceDetailScreen
            invoiceId={labInvoiceId}
            onBack={() => setLabInvoiceId(null)}
          />
        ) : (
          <LabInboxScreen
            onSelectCase={setLabCaseId}
            onSelectInvoice={setLabInvoiceId}
            onSelectPlansForCase={setLabPlansForCaseId}
          />
        ))}
      {tab === 'inbox' && <NotificationsScreen />}
    </ResponsiveShell>
  );
}

function PortalShell() {
  const [tab, setTab] = useState<PortalTabKey>('home');
  const t = useT();

  const tabs: Tab<PortalTabKey>[] = [
    { key: 'home', label: t('portal.tabs.home'), icon: 'home' },
    { key: 'appointments', label: t('portal.tabs.appointments'), icon: 'calendar' },
    { key: 'records', label: t('portal.tabs.records'), icon: 'file-text' },
    { key: 'invoices', label: t('portal.tabs.invoices'), icon: 'credit-card' },
  ];

  return (
    <ResponsiveShell tabs={tabs} active={tab} onChange={setTab} brand={t('app.brand')}>
      {tab === 'home' && <PortalHomeScreen />}
      {tab === 'appointments' && <PortalAppointmentsScreen />}
      {tab === 'records' && <PortalRecordsScreen />}
      {tab === 'invoices' && <PortalInvoicesScreen />}
    </ResponsiveShell>
  );
}

/** Slim band with the language switch. Sits under content on both layouts. */
function ShellFooter() {
  return (
    <View className="border-t border-border bg-card px-6 py-2">
      <View className="items-end">
        <LangSwitch />
      </View>
    </View>
  );
}

export default App;
