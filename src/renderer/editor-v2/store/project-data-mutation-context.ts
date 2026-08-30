import { createContext, useContext } from 'react';

import type { EditorV2DataMutationResult } from '@/types/editor-v2';

export type ProjectDataMutationRunner = (
  operation: (expectedRevision: number) => Promise<EditorV2DataMutationResult>
) => Promise<EditorV2DataMutationResult>;

const ProjectDataMutationContext =
  createContext<ProjectDataMutationRunner | null>(null);

export const ProjectDataMutationProvider = ProjectDataMutationContext.Provider;

export const useProjectDataMutation = (): ProjectDataMutationRunner => {
  const runner = useContext(ProjectDataMutationContext);
  if (!runner) {
    throw new Error('Project data mutation provider is unavailable');
  }
  return runner;
};
