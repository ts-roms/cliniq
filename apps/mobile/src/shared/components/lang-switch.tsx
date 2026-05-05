import { Text, TouchableOpacity, View } from 'react-native';
import { languages, setLang, useLang } from '../i18n';

/**
 * Tiny EN/PH toggle. RN's <Picker> requires an extra dep, so we render the
 * languages as toggleable chips — fine for two locales.
 */
export function LangSwitch() {
  const lang = useLang();
  return (
    <View className="flex-row gap-1">
      {languages().map((l) => {
        const active = l.code === lang;
        return (
          <TouchableOpacity
            key={l.code}
            onPress={() => setLang(l.code)}
            className={`rounded-full px-3 py-1 ${
              active ? 'bg-primary' : 'border border-border bg-card'
            }`}
          >
            <Text
              className={`text-xs ${active ? 'text-primary-foreground' : 'text-foreground'}`}
            >
              {l.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
