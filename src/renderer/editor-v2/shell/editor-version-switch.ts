export const canShowEditorVersionSwitch = (
  mainAllowed: boolean,
  rendererIsDevelopment = import.meta.env.DEV
): boolean => mainAllowed && rendererIsDevelopment;
