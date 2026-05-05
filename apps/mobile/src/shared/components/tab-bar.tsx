import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

export interface Tab<T extends string> {
  key: T;
  label: string;
  badge?: number;
  /** Feather icon name. Required if you want the rail to show icons on tablets. */
  icon?: keyof typeof Feather.glyphMap;
}

interface Props<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (next: T) => void;
}

/**
 * Bottom tab bar — used on phone-width viewports. On tablets we render a
 * vertical NavRail instead (see ./nav-rail.tsx). Tabs that supply an `icon`
 * field render it above the label.
 */
export function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <View className="flex-row border-t border-border bg-card">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const showBadge = tab.badge && tab.badge > 0;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            className={`flex-1 items-center py-2.5 ${
              isActive ? 'border-t-2 border-primary bg-primary/5' : 'border-t-2 border-transparent'
            }`}
          >
            <View className="items-center">
              {tab.icon && (
                <Feather
                  name={tab.icon}
                  size={18}
                  color={isActive ? undefined : '#6b7280'}
                  style={{ marginBottom: 2, opacity: isActive ? 1 : 0.9 }}
                />
              )}
              <View>
                <Text
                  className={`text-xs ${
                    isActive
                      ? 'font-semibold text-primary'
                      : 'font-medium text-foreground/70'
                  }`}
                >
                  {tab.label}
                </Text>
                {showBadge && (
                  <View className="absolute -right-3 -top-1 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1">
                    <Text className="text-[10px] font-medium text-white">
                      {tab.badge && tab.badge > 99 ? '99+' : tab.badge}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
