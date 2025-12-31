export interface QuotaCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  available: number;
  fileSize: number;
  exceedsBy?: number;
  message?: string;
}

/**
 * Check if a file upload would exceed the user's storage quota
 * Quota enforcement has been disabled; always allow.
 */
export async function checkStorageQuota(
  userId: string,
  fileSize: number
): Promise<QuotaCheckResult> {
  return {
    allowed: true,
    currentUsage: 0,
    limit: Number.POSITIVE_INFINITY,
    available: Number.POSITIVE_INFINITY,
    fileSize,
    message: undefined,
  };
}

// Quota helpers are intentionally no-ops now that enforcement is disabled.
export async function isNearQuotaLimit(): Promise<boolean> {
  return false;
}

export async function getRemainingStorage(): Promise<{
  remaining: number;
  remainingFormatted: string;
  percentUsed: number;
}> {
  return {
    remaining: Number.POSITIVE_INFINITY,
    remainingFormatted: 'Unlimited',
    percentUsed: 0,
  };
}
