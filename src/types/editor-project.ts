export type EditorProjectFormat = 'v1' | 'v2' | 'hybrid';

export interface CaptyPackageProjectLocation {
  kind: 'capty-package';
  packagePath: string;
  format: EditorProjectFormat;
  v1RecordingPath?: string;
}

export interface StandaloneProjectLocation {
  kind: 'standalone';
  sourcePath: string;
}

export type EditorProjectLocation =
  CaptyPackageProjectLocation | StandaloneProjectLocation;
