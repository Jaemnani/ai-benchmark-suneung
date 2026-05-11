import RNHaptic from 'react-native-haptic-feedback';

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const haptic = {
  light: () => RNHaptic.trigger('impactLight', options),
  medium: () => RNHaptic.trigger('impactMedium', options),
  heavy: () => RNHaptic.trigger('impactHeavy', options),
  success: () => RNHaptic.trigger('notificationSuccess', options),
  warning: () => RNHaptic.trigger('notificationWarning', options),
  error: () => RNHaptic.trigger('notificationError', options),
  selection: () => RNHaptic.trigger('selection', options),
};
