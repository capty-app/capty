import type { SettingsItem } from '../settings-registry';

export const GENERAL_ITEMS: SettingsItem[] = [
  {
    id: 'general.startOnLogin',
    category: 'general',
    section: 'Application',
    type: 'switch',
    label: 'Start on login',
    description: 'Launch Capty automatically when you log in',
    keywords: ['startup', 'launch', 'boot', 'login', 'auto start'],
    getValue: s => s.general.startOnLogin,
    setValue: (s, v) => ({
      general: { ...s.general, startOnLogin: v },
    }),
  },
  {
    id: 'general.playSound',
    category: 'general',
    section: 'Application',
    type: 'switch',
    label: 'Play sound',
    description: 'Play a sound effect when taking screenshots',
    keywords: ['audio', 'sound', 'effect', 'noise', 'capture sound'],
    getValue: s => s.general.playSoundOnScreenshot,
    setValue: (s, v) => ({
      general: { ...s.general, playSoundOnScreenshot: v },
    }),
  },
  {
    id: 'general.showCaptureNotifications',
    category: 'general',
    section: 'Application',
    type: 'switch',
    label: 'Show capture notifications',
    description:
      'Show a notification when a capture is copied to the clipboard',
    keywords: [
      'notification',
      'capture',
      'clipboard',
      'copy',
      'confirmation',
      'screenshot',
    ],
    getValue: s => s.general.showCaptureNotifications,
    setValue: (s, v) => ({
      general: { ...s.general, showCaptureNotifications: v },
    }),
  },
  {
    id: 'general.showDeletionNotifications',
    category: 'general',
    section: 'Application',
    type: 'switch',
    label: 'Show deletion notifications',
    description:
      'Show a notification when a screenshot or video is permanently deleted',
    keywords: [
      'notification',
      'delete',
      'deletion',
      'remove',
      'screenshot',
      'video',
      'recording',
    ],
    getValue: s => s.general.showDeletionNotifications,
    setValue: (s, v) => ({
      general: { ...s.general, showDeletionNotifications: v },
    }),
  },
  {
    id: 'general.historyEnabled',
    category: 'general',
    section: 'History',
    type: 'switch',
    label: 'Enable history',
    description: 'Keep a history of your screenshots for quick access',
    keywords: ['history', 'recent', 'past', 'log'],
    getValue: s => s.history.enabled,
    setValue: (s, v) => ({
      history: { ...s.history, enabled: v },
    }),
  },
  {
    id: 'general.historyMaxItems',
    category: 'general',
    section: 'History',
    type: 'slider',
    label: 'Maximum items',
    description: 'Number of screenshots to keep in history',
    keywords: ['history', 'limit', 'max', 'count', 'items'],
    min: 10,
    max: 200,
    step: 10,
    getValue: s => s.history.maxItems,
    setValue: (s, v) => ({
      history: { ...s.history, maxItems: v },
    }),
    visibleWhen: s => s.history.enabled,
  },
];
