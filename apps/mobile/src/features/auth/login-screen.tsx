import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { authControllerLogin } from '@org/api-client';
import { useT } from '../../shared/i18n';
import { LangSwitch } from '../../shared/components/lang-switch';
import { PasswordInput } from '../../shared/components/password-input';
import { useResponsiveValue } from '../../shared/hooks/use-breakpoint';
import { saveSession, type Session } from './session';

export function LoginScreen() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: e } = await authControllerLogin({
        body: { email: email.trim(), password },
      });
      if (e || !data) throw new Error(t('auth.invalid_credentials'));
      saveSession(data as unknown as Session);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!email.trim() && !!password && !submitting;
  // Tighter card on small phones, comfortable on standard phones, capped on tablets.
  const columnWidth =
    useResponsiveValue({ xs: 'max-w-xs', sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-md' }) ??
    'max-w-md';
  // Pin the centering layer to an explicit viewport height. The flex-chain
  // through SafeAreaView -> KAV -> ScrollView -> contentContainer doesn't
  // propagate height reliably on react-native-web, so `justify-center` had
  // nothing to distribute. `useWindowDimensions` re-renders on rotation/resize.
  const { height: windowHeight } = useWindowDimensions();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      className="bg-background"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            minHeight: windowHeight,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
            paddingVertical: 40,
          }}
        >
        <View className={`w-full ${columnWidth}`}>
        {/* Brand mark */}
        <View className="items-center">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <Text className="text-xl font-semibold text-primary-foreground">C</Text>
          </View>
          <Text className="mt-3 text-[11px] uppercase tracking-[3px] text-muted-foreground">
            {t('app.brand')}
          </Text>
        </View>

        {/* Card */}
        <View className="mt-6 rounded-2xl border border-border bg-card px-6 py-6 shadow-sm">
          <Text className="text-2xl font-light text-foreground">
            {t('auth.signin')}
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {t('auth.welcome_back')}
          </Text>

          <View className="mt-6 space-y-4">
            <View>
              <Text className="mb-1.5 text-xs font-medium text-foreground">
                {t('auth.email')}
              </Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@clinic.ph"
                placeholderTextColor="#9ca3af"
                className="rounded-md border border-border bg-background px-3 py-3 text-base text-foreground"
              />
            </View>

            <View>
              <Text className="mb-1.5 text-xs font-medium text-foreground">
                {t('auth.password')}
              </Text>
              <PasswordInput
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.password_placeholder')}
                placeholderTextColor="#9ca3af"
                className="bg-background"
              />
            </View>

            {error && (
              <View className="flex-row items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                <Feather name="alert-circle" size={14} color="#dc2626" />
                <Text className="flex-1 text-sm text-destructive">{error}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={onSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
              className={`mt-2 items-center justify-center rounded-md px-6 py-3.5 ${
                canSubmit ? 'bg-primary' : 'bg-primary/50'
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-medium text-primary-foreground">
                  {t('auth.signin')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View className="mt-8 items-center">
          <LangSwitch />
        </View>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
