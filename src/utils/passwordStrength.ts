/**
 * Calculates password/passphrase strength based on:
 * - Length (8+ chars = 25%, 12+ chars = additional 25%)
 * - Mixed case (lowercase + uppercase = 25%)
 * - Numbers + special characters (25%)
 * Returns a value from 0-100
 */
export const calculatePasswordStrength = (password: string): number => {
  if (!password) return 0;
  let strength = 0;
  if (password.length >= 8) strength += 25;
  if (password.length >= 12) strength += 25;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
  if (/\d/.test(password) && /[^a-zA-Z\d]/.test(password)) strength += 25;
  return strength;
};

/**
 * Returns the appropriate color for the strength value
 */
export const getStrengthColor = (strength: number): 'error' | 'warning' | 'info' | 'success' => {
  if (strength <= 25) return 'error';
  if (strength <= 50) return 'warning';
  if (strength <= 75) return 'info';
  return 'success';
};

/**
 * Returns the text label for the strength value
 */
export const getStrengthLabel = (strength: number): string => {
  if (strength <= 25) return 'Weak';
  if (strength <= 50) return 'Fair';
  if (strength <= 75) return 'Good';
  return 'Strong';
};

/**
 * Validates password meets standard complexity requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * Returns an array of error messages (empty if valid)
 */
export const validatePasswordComplexity = (password: string): string[] => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[^a-zA-Z\d]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)');
  }
  
  return errors;
};

/**
 * Validates passphrase meets standard complexity requirements:
 * - Minimum 12 characters (higher than password for encryption keys)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * Returns an array of error messages (empty if valid)
 */
export const validatePassphraseComplexity = (passphrase: string): string[] => {
  const errors: string[] = [];
  
  if (passphrase.length < 12) {
    errors.push('Passphrase must be at least 12 characters long');
  }
  
  if (!/[A-Z]/.test(passphrase)) {
    errors.push('Passphrase must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(passphrase)) {
    errors.push('Passphrase must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(passphrase)) {
    errors.push('Passphrase must contain at least one number');
  }
  
  if (!/[^a-zA-Z\d]/.test(passphrase)) {
    errors.push('Passphrase must contain at least one special character (!@#$%^&*(),.?":{}|<>)');
  }
  
  return errors;
};
