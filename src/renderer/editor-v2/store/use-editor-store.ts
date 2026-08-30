import { useContext } from 'react';

import { EditorStoreContext, type EditorStoreValue } from './editor-context';

export const useEditorStore = (): EditorStoreValue => {
  const value = useContext(EditorStoreContext);
  if (!value) throw new Error('Editor store is unavailable');
  return value;
};
