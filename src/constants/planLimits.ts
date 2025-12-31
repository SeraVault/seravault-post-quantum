/**
 * Storage allocation limits for each subscription plan
 * Values are read from environment variables for central configuration
 */

// Read storage limits from environment variables (in GB)
const FREE_STORAGE_GB = parseFloat(import.meta.env.VITE_PLAN_STORAGE_FREE_GB || '0.0976563');
const PERSONAL_STORAGE_GB = parseFloat(import.meta.env.VITE_PLAN_STORAGE_PERSONAL_GB || '10');
const FAMILY_STORAGE_GB = parseFloat(import.meta.env.VITE_PLAN_STORAGE_FAMILY_GB || '80');
const PROFESSIONAL_STORAGE_GB = parseFloat(import.meta.env.VITE_PLAN_STORAGE_PROFESSIONAL_GB || '320');
const BUSINESS_STORAGE_GB = parseFloat(import.meta.env.VITE_PLAN_STORAGE_BUSINESS_GB || '1000');

// Convert GB to bytes
const GB_TO_BYTES = 1024 * 1024 * 1024;

/**
 * Format storage limit for display
 */
function formatStorageLimit(gb: number): string {
  if (gb < 1) {
    return `${Math.round(gb * 1024)} MB`;
  }
  if (gb >= 1000) {
    return `${gb / 1000} TB`;
  }
  return `${gb} GB`;
}

export const PLAN_STORAGE_LIMITS = {
  free: {
    name: 'Free',
    bytes: FREE_STORAGE_GB * GB_TO_BYTES,
    gb: FREE_STORAGE_GB,
    formatted: formatStorageLimit(FREE_STORAGE_GB),
  },
  personal: {
    name: 'Personal',
    bytes: PERSONAL_STORAGE_GB * GB_TO_BYTES,
    gb: PERSONAL_STORAGE_GB,
    formatted: formatStorageLimit(PERSONAL_STORAGE_GB),
  },
  family: {
    name: 'Family',
    bytes: FAMILY_STORAGE_GB * GB_TO_BYTES,
    gb: FAMILY_STORAGE_GB,
    formatted: formatStorageLimit(FAMILY_STORAGE_GB),
  },
  professional: {
    name: 'Professional',
    bytes: PROFESSIONAL_STORAGE_GB * GB_TO_BYTES,
    gb: PROFESSIONAL_STORAGE_GB,
    formatted: formatStorageLimit(PROFESSIONAL_STORAGE_GB),
  },
  business: {
    name: 'Business',
    bytes: BUSINESS_STORAGE_GB * GB_TO_BYTES,
    gb: BUSINESS_STORAGE_GB,
    formatted: formatStorageLimit(BUSINESS_STORAGE_GB),
  },
} as const;

export type PlanType = keyof typeof PLAN_STORAGE_LIMITS;

/**
 * Get storage limit for a given plan
 */
export function getStorageLimitForPlan(planName?: string | null): typeof PLAN_STORAGE_LIMITS[PlanType] {
  if (!planName) {
    return PLAN_STORAGE_LIMITS.free;
  }

  // Strip out billing interval suffix (e.g., "Professional - Monthly" -> "professional")
  const normalizedPlanName = planName
    .toLowerCase()
    .trim()
    .replace(/\s*-\s*(monthly|yearly|montly)$/i, '');
  
  // Check if it matches any plan
  if (normalizedPlanName in PLAN_STORAGE_LIMITS) {
    return PLAN_STORAGE_LIMITS[normalizedPlanName as PlanType];
  }

  // Default to free if plan name doesn't match
  return PLAN_STORAGE_LIMITS.free;
}
