interface ImportResult {
  success: boolean;
  error?: string;
}

interface ResolvedImportResult<T> {
  result: T | null;
  error: string | null;
}

export async function resolveImportResult<T extends ImportResult>(
  operation: () => Promise<T>,
  fallbackError: string
): Promise<ResolvedImportResult<T>> {
  try {
    const result = await operation();
    const resultError = result.error?.trim();

    if (result.success || resultError === 'Cancelled') {
      return { result, error: null };
    }

    return { result, error: resultError || fallbackError };
  } catch (error) {
    const rejectionError = error instanceof Error ? error.message.trim() : '';
    return {
      result: null,
      error: rejectionError || fallbackError,
    };
  }
}
