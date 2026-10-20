import type { SaveFailureContext, SaveFailureReport } from '@shared/types';

/** Logging must never prevent the user from recovering or explicitly exiting. */
export async function reportSaveFailure(error: unknown, context: Pick<SaveFailureContext, 'operation' | 'target'>): Promise<SaveFailureReport> {
  const message = error instanceof Error ? error.message : String(error);
  try {
    return await window.mapPainter.reportSaveFailure({ ...context, message,
      stack: error instanceof Error ? error.stack : undefined });
  } catch (logError) {
    return { operation: context.operation, message, logPath: null,
      logError: logError instanceof Error ? logError.message : String(logError) };
  }
}
