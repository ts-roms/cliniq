// Minimal in-app translation dictionary. Keep keys flat (`section.key`) and
// edit by hand — 30-50 keys is the right ceiling before reaching for
// react-i18next or similar. Filipino strings cover the most-visible
// header/auth/common-action surface; expand opportunistically as features
// land in front of pilot clinics.

export type Lang = 'en' | 'ph';

export const DEFAULT_LANG: Lang = 'en';

const dicts: Record<Lang, Record<string, string>> = {
  en: {
    'app.brand': 'ClinIQ',
    'nav.dashboard': 'Dashboard',
    'nav.patients': 'Patients',
    'nav.schedule': 'Schedule',
    'nav.inventory': 'Inventory',
    'nav.claims': 'Claims',
    'nav.audit': 'Audit',
    'nav.dsr': 'DSR',
    'nav.settings': 'Settings',
    'nav.signout': 'Sign out',
    'profile.signed_in_as': 'Signed in as',
    'profile.language': 'Language',
    'auth.signin': 'Sign in',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'common.loading': 'Loading…',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.close': 'Close',
    'common.search': 'Search',
    'common.refresh': 'Refresh',
    'common.notifications': 'Notifications',
    'patients.title': 'Patients',
    'patients.add': 'Add patient',
    'schedule.title': 'Schedule',
    'schedule.new': 'New appointment',
    'schedule.today': 'Today',
    'schedule.prev': 'Prev',
    'schedule.next': 'Next',
  },
  ph: {
    'app.brand': 'ClinIQ',
    'nav.dashboard': 'Dashboard',
    'nav.patients': 'Mga pasyente',
    'nav.schedule': 'Iskedyul',
    'nav.inventory': 'Imbentaryo',
    'nav.claims': 'Mga claim',
    'nav.audit': 'Audit',
    'nav.dsr': 'DSR',
    'nav.settings': 'Mga setting',
    'nav.signout': 'Mag-sign out',
    'profile.signed_in_as': 'Naka-sign in bilang',
    'profile.language': 'Wika',
    'auth.signin': 'Mag-sign in',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'common.loading': 'Naglo-load…',
    'common.save': 'I-save',
    'common.cancel': 'Kanselahin',
    'common.delete': 'Burahin',
    'common.edit': 'I-edit',
    'common.add': 'Magdagdag',
    'common.close': 'Isara',
    'common.search': 'Maghanap',
    'common.refresh': 'I-refresh',
    'common.notifications': 'Mga abiso',
    'patients.title': 'Mga pasyente',
    'patients.add': 'Magdagdag ng pasyente',
    'schedule.title': 'Iskedyul',
    'schedule.new': 'Bagong appointment',
    'schedule.today': 'Ngayon',
    'schedule.prev': 'Nakaraan',
    'schedule.next': 'Susunod',
  },
};

export function translate(lang: Lang, key: string): string {
  // Fall back to English when a key hasn't been translated, then to the key
  // itself so a typo is at least visible in the UI rather than blank.
  return dicts[lang][key] ?? dicts.en[key] ?? key;
}

export function languages(): Array<{ code: Lang; label: string }> {
  return [
    { code: 'en', label: 'English' },
    { code: 'ph', label: 'Filipino' },
  ];
}
