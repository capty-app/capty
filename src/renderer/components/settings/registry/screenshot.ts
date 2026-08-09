import type { MultiImageAttachEdge, ScreenshotFormat } from '@/types/settings';
import type { SettingsItem } from '../settings-registry';

export const SCREENSHOT_ITEMS: SettingsItem[] = [
  {
    id: 'screenshot.captureToClipboard',
    category: 'screenshot',
    section: 'Capture Mode',
    type: 'switch',
    label: 'Capture to clipboard',
    description:
      'Copy screenshots directly to clipboard without opening the editor',
    keywords: ['clipboard', 'copy', 'capture', 'direct'],
    getValue: s => s.screenshot.captureToClipboard,
    setValue: (s, v) => ({
      screenshot: {
        ...s.screenshot,
        captureToClipboard: v,
        showPreview: v ? false : s.screenshot.showPreview,
      },
    }),
  },
  {
    id: 'screenshot.showPreview',
    category: 'screenshot',
    section: 'Capture Mode',
    type: 'switch',
    label: 'Show preview',
    description:
      'Show a preview thumbnail after capturing instead of opening the editor',
    keywords: ['preview', 'thumbnail', 'capture'],
    getValue: s => s.screenshot.showPreview,
    setValue: (s, v) => ({
      screenshot: {
        ...s.screenshot,
        showPreview: v,
        captureToClipboard: v ? false : s.screenshot.captureToClipboard,
      },
    }),
  },
  {
    id: 'screenshot.previewFollowActiveDisplay',
    category: 'screenshot',
    section: 'Capture Mode',
    type: 'switch',
    label: 'Previews follow active display',
    description: 'Move capture previews to the display your cursor is on',
    keywords: ['preview', 'display', 'monitor', 'follow', 'cursor'],
    getValue: s => s.preview.followActiveDisplay,
    setValue: (s, v) => ({
      preview: { ...s.preview, followActiveDisplay: v },
    }),
  },
  {
    id: 'screenshot.hideDesktopIcons',
    category: 'screenshot',
    section: 'Capture Mode',
    type: 'switch',
    label: 'Hide desktop icons',
    description: 'Temporarily hide desktop icons when capturing screenshots',
    keywords: ['desktop', 'icons', 'hide', 'clean', 'accessibility'],
    getValue: s => s.screenshot.hideDesktopIcons,
    setValue: (s, v) => ({
      screenshot: { ...s.screenshot, hideDesktopIcons: v },
    }),
    onBeforeChange: async (_s, v) => {
      if (!v) return true;
      return window.ipcRenderer.invoke(
        'permissions:requestAccessibilityForDesktopIcons'
      );
    },
  },
  {
    id: 'screenshot.freezeScreen',
    category: 'screenshot',
    section: 'Capture Mode',
    type: 'switch',
    label: 'Freeze screen',
    description: 'Show a static snapshot while selecting an area to capture',
    keywords: ['freeze', 'static', 'snapshot', 'still'],
    getValue: s => s.screenshot.freezeScreen,
    setValue: (s, v) => ({
      screenshot: { ...s.screenshot, freezeScreen: v },
    }),
  },
  {
    id: 'screenshot.closeOnCopy',
    category: 'screenshot',
    section: 'Window Behavior',
    type: 'switch',
    label: 'Close on copy',
    description: 'Automatically close the window after copying the screenshot',
    keywords: ['close', 'copy', 'auto close', 'window'],
    getValue: s => s.screenshot.closeOnCopy,
    setValue: (s, v) => ({
      screenshot: { ...s.screenshot, closeOnCopy: v },
    }),
  },
  {
    id: 'screenshot.closeOnSave',
    category: 'screenshot',
    section: 'Window Behavior',
    type: 'switch',
    label: 'Close on save',
    description: 'Automatically close the window after saving the screenshot',
    keywords: ['close', 'save', 'auto close', 'window'],
    getValue: s => s.screenshot.closeOnSave,
    setValue: (s, v) => ({
      screenshot: { ...s.screenshot, closeOnSave: v },
    }),
  },
  {
    id: 'screenshot.format',
    category: 'screenshot',
    section: 'Output',
    type: 'select',
    label: 'File format',
    description: 'Choose the format for saved screenshots',
    keywords: ['format', 'png', 'jpeg', 'jpg', 'file type', 'image'],
    options: [
      { value: 'png', label: 'PNG' },
      { value: 'jpeg', label: 'JPEG' },
    ],
    getValue: s => s.screenshot.format,
    setValue: (s, v) => ({
      screenshot: { ...s.screenshot, format: v as ScreenshotFormat },
    }),
  },
  {
    id: 'screenshot.multiImageAttachEdge',
    category: 'screenshot',
    section: 'Open With',
    type: 'select',
    label: 'Multi-image layout',
    description:
      'When opening multiple images at once, attach the extras to this edge of the first image',
    keywords: [
      'open with',
      'multiple',
      'images',
      'attach',
      'side by side',
      'layout',
      'edge',
    ],
    options: [
      { value: 'right', label: 'Right (side-by-side)' },
      { value: 'left', label: 'Left' },
      { value: 'bottom', label: 'Bottom (stacked)' },
      { value: 'top', label: 'Top' },
    ],
    getValue: s => s.screenshot.multiImageAttachEdge,
    setValue: (s, v) => ({
      screenshot: {
        ...s.screenshot,
        multiImageAttachEdge: v as MultiImageAttachEdge,
      },
    }),
  },
];
