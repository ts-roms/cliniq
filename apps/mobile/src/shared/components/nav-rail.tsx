import { Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Tab } from './tab-bar';

interface Props<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (next: T) => void;
  brand?: string;
  /**
   * `compact` — 96px wide, icon stacked over label (lg breakpoint).
   * `expanded` — 220px wide, icon beside full-width label rows (xl breakpoint).
   */
  variant?: 'compact' | 'expanded';
}

/**
 * Vertical navigation rail used at tablet widths. The bottom TabBar is hidden
 * when this is rendered; both consume the same `Tab<T>` definition.
 */
export function NavRail<T extends string>({
  tabs,
  active,
  onChange,
  brand,
  variant = 'compact',
}: Props<T>) {
  const expanded = variant === 'expanded';
  return (
    <View
      className={`shrink-0 border-r border-border bg-card ${
        expanded ? 'w-56' : 'w-24'
      }`}
    >
      {brand && (
        <View
          className={`pt-6 pb-4 ${expanded ? 'flex-row items-center gap-3 px-4' : 'items-center px-2'}`}
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Text className="text-base font-semibold text-primary-foreground">
              {brand.charAt(0).toUpperCase()}
            </Text>
          </View>
          {expanded && (
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
              {brand}
            </Text>
          )}
        </View>
      )}
      <View className={`gap-1 pt-2 ${expanded ? 'px-3' : 'px-2'}`}>
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          const showBadge = tab.badge && tab.badge > 0;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className={`rounded-xl ${
                isActive ? 'bg-primary/10' : ''
              } ${
                expanded
                  ? 'flex-row items-center gap-3 px-3 py-2.5'
                  : 'items-center px-2 py-3'
              }`}
            >
              <View>
                {tab.icon && (
                  <Feather
                    name={tab.icon}
                    size={20}
                    color={isActive ? undefined : '#6b7280'}
                    style={{ opacity: isActive ? 1 : 0.9 }}
                  />
                )}
                {showBadge && (
                  <View className="absolute -right-2 -top-1 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1">
                    <Text className="text-[10px] font-medium text-white">
                      {tab.badge && tab.badge > 99 ? '99+' : tab.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                className={`${expanded ? 'text-sm' : 'mt-1.5 text-[11px]'} ${
                  isActive
                    ? 'font-semibold text-primary'
                    : 'font-medium text-foreground/70'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
