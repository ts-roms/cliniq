import { forwardRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useT } from '../i18n';

export type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'>;

export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const t = useT();
    const [visible, setVisible] = useState(false);
    return (
      <View className="relative">
        <TextInput
          ref={ref}
          {...props}
          secureTextEntry={!visible}
          autoComplete={props.autoComplete ?? 'password'}
          className={[
            'rounded-md border border-border bg-card px-3 py-3 pr-12 text-base text-foreground',
            className ?? '',
          ].join(' ')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? t('auth.hide_password') : t('auth.show_password')}
          accessibilityState={{ selected: visible }}
          onPress={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 items-center justify-center px-3"
          hitSlop={8}
        >
          <Feather name={visible ? 'eye-off' : 'eye'} size={18} color="#6b7280" />
        </Pressable>
      </View>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
