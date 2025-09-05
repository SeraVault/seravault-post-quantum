/**
 * Embedded form templates - these are stored directly in form files
 * This replaces the database-stored templates for better sharing and portability
 */

import type { FormTemplate } from './formFiles';

/**
 * Get built-in form templates that can be embedded in forms
 */
export function getBuiltInFormTemplates(): { [key: string]: FormTemplate } {
  return {
    credit_card: {
      templateId: 'credit_card',
      name: 'Credit Card',
      description: 'Store credit card information securely',
      category: 'Finance',
      icon: 'CreditCard',
      color: '#1976d2',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'card_name',
      schema: {
        fields: [
          { id: 'card_name', type: 'text', label: 'Card Name', required: true, placeholder: 'e.g., Personal Visa' },
          { id: 'cardholder_name', type: 'text', label: 'Cardholder Name', required: true },
          { id: 'card_number', type: 'text', label: 'Card Number', sensitive: true, required: true, placeholder: '1234 5678 9012 3456' },
          { id: 'expiry_date', type: 'date', label: 'Expiry Date', required: true },
          { id: 'cvv', type: 'password', label: 'CVV', sensitive: true, required: true },
          { id: 'pin', type: 'text', label: 'PIN', sensitive: true, placeholder: '4 digits' },
          { id: 'bank_name', type: 'text', label: 'Bank Name' },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Additional notes...' },
        ],
      },
      defaultData: {},
      tags: ['finance', 'payment'],
    },

    password: {
      templateId: 'password',
      name: 'Password',
      description: 'Store login credentials securely',
      category: 'Security',
      icon: 'Lock',
      color: '#d32f2f',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'site_service',
      schema: {
        fields: [
          { id: 'site_service', type: 'text', label: 'Site/Service', required: true, placeholder: 'e.g., Gmail, Facebook' },
          { id: 'website_url', type: 'text', label: 'Website URL', placeholder: 'https://example.com' },
          { id: 'username', type: 'text', label: 'Username', required: true },
          { id: 'email', type: 'text', label: 'Email' },
          { id: 'password', type: 'password', label: 'Password', sensitive: true, required: true },
          { id: 'security_q1', type: 'text', label: 'Security Question 1' },
          { id: 'security_a1', type: 'text', label: 'Security Answer 1', sensitive: true },
          { id: 'security_q2', type: 'text', label: 'Security Question 2' },
          { id: 'security_a2', type: 'text', label: 'Security Answer 2', sensitive: true },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Additional notes...' },
        ],
      },
      defaultData: {},
      tags: ['security', 'login'],
    },

    secure_note: {
      templateId: 'secure_note',
      name: 'Secure Note',
      description: 'Store rich text notes securely',
      category: 'Notes',
      icon: 'StickyNote2',
      color: '#7b1fa2',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'title',
      schema: {
        fields: [
          { id: 'title', type: 'text', label: 'Title', required: true },
          { id: 'content', type: 'richtext', label: 'Content', required: false, placeholder: 'Your secure note content with rich formatting...' },
          { id: 'tags', type: 'text', label: 'Tags' },
        ],
      },
      defaultData: {},
      tags: ['notes', 'text'],
    },

    bank_account: {
      templateId: 'bank_account',
      name: 'Bank Account',
      description: 'Store banking information securely',
      category: 'Finance',
      icon: 'AccountBalance',
      color: '#388e3c',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'account_name',
      schema: {
        fields: [
          { id: 'account_name', type: 'text', label: 'Account Name', required: true, placeholder: 'e.g., Personal Checking' },
          { id: 'bank_name', type: 'text', label: 'Bank Name', required: true },
          { id: 'account_number', type: 'text', label: 'Account Number', sensitive: true, required: true },
          { id: 'routing_number', type: 'text', label: 'Routing Number', required: true },
          { id: 'account_type', type: 'text', label: 'Account Type' },
          { id: 'swift_bic', type: 'text', label: 'SWIFT/BIC Code', placeholder: 'For international transfers' },
          { id: 'iban', type: 'text', label: 'IBAN', placeholder: 'International Bank Account Number' },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Additional banking information...' },
        ],
      },
      defaultData: {},
      tags: ['finance', 'banking'],
    },

    identity: {
      templateId: 'identity',
      name: 'Identity Document',
      description: 'Store personal identification documents',
      category: 'Personal',
      icon: 'Person',
      color: '#f57c00',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'full_name',
      schema: {
        fields: [
          { id: 'full_name', type: 'text', label: 'Full Name', required: true },
          { id: 'ssn', type: 'text', label: 'Social Security Number', sensitive: true },
          { id: 'passport_number', type: 'text', label: 'Passport Number', sensitive: true },
          { id: 'passport_expiry', type: 'date', label: 'Passport Expiry' },
          { id: 'driver_license', type: 'text', label: 'Driver License Number', sensitive: true },
          { id: 'license_expiry', type: 'date', label: 'License Expiry' },
          { id: 'national_id', type: 'text', label: 'National ID', sensitive: true },
          { id: 'date_of_birth', type: 'date', label: 'Date of Birth' },
          { id: 'address', type: 'textarea', label: 'Address' },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Additional identification details...' },
        ],
      },
      defaultData: {},
      tags: ['personal', 'identity'],
    },

    wifi_network: {
      templateId: 'wifi_network',
      name: 'WiFi Network',
      description: 'Store WiFi network credentials and settings',
      category: 'Network',
      icon: 'Wifi',
      color: '#0288d1',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'network_name',
      schema: {
        fields: [
          { id: 'network_name', type: 'text', label: 'Network Name (SSID)', required: true },
          { id: 'password', type: 'password', label: 'WiFi Password', sensitive: true, required: true },
          { id: 'security_type', type: 'text', label: 'Security Type' },
          { id: 'router_ip', type: 'text', label: 'Router IP Address', placeholder: 'e.g., 192.168.1.1' },
          { id: 'admin_username', type: 'text', label: 'Admin Username' },
          { id: 'admin_password', type: 'password', label: 'Admin Password', sensitive: true },
          { id: 'wps_pin', type: 'text', label: 'WPS PIN', sensitive: true },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Network configuration details...' },
        ],
      },
      defaultData: {},
      tags: ['network', 'tech'],
    },

    crypto_wallet: {
      templateId: 'crypto_wallet',
      name: 'Crypto Wallet',
      description: 'Store cryptocurrency wallet information',
      category: 'Crypto',
      icon: 'AccountBalanceWallet',
      color: '#ff9800',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'wallet_name',
      schema: {
        fields: [
          { id: 'wallet_name', type: 'text', label: 'Wallet Name', required: true, placeholder: 'e.g., Bitcoin Main Wallet' },
          { id: 'wallet_type', type: 'text', label: 'Wallet Type' },
          { id: 'seed_phrase', type: 'textarea', label: 'Seed Phrase', sensitive: true, placeholder: '12 or 24 word recovery phrase' },
          { id: 'private_key', type: 'password', label: 'Private Key', sensitive: true, required: true },
          { id: 'public_address', type: 'text', label: 'Public Address', required: true },
          { id: 'passphrase', type: 'password', label: 'Passphrase', sensitive: true },
          { id: 'pin_code', type: 'password', label: 'PIN Code', sensitive: true },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Wallet configuration and backup information...' },
        ],
      },
      defaultData: {},
      tags: ['crypto', 'wallet'],
    },

    medical_record: {
      templateId: 'medical_record',
      name: 'Medical Record',
      description: 'Store medical and health information with documents',
      category: 'Health',
      icon: 'LocalHospital',
      color: '#e53935',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'patient_name',
      schema: {
        fields: [
          { id: 'patient_name', type: 'text', label: 'Patient Name', required: true },
          { id: 'patient_id', type: 'text', label: 'Patient ID', sensitive: true },
          { id: 'provider_name', type: 'text', label: 'Healthcare Provider' },
          { id: 'allergies', type: 'textarea', label: 'Allergies', placeholder: 'Known allergies and reactions...' },
          { id: 'medications', type: 'textarea', label: 'Current Medications' },
          { id: 'conditions', type: 'textarea', label: 'Medical Conditions', placeholder: 'Chronic conditions, diagnoses...' },
          { id: 'emergency_contact', type: 'text', label: 'Emergency Contact' },
          { id: 'insurance_info', type: 'textarea', label: 'Insurance Information' },
          { id: 'medical_documents', type: 'file', label: 'Medical Documents', 
            fileConfig: { 
              maxFiles: 10, 
              maxFileSize: 50 * 1024 * 1024, // 50MB 
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'text/plain'],
              description: 'Upload medical documents, test results, X-rays, etc. (PDF, images, text files)'
            }
          },
          { id: 'notes', type: 'richtext', label: 'Notes', placeholder: 'Detailed medical history, procedures, test results...' },
        ],
      },
      defaultData: {
        medical_documents: [] // Initialize file field as empty array
      },
      tags: ['health', 'medical'],
    },

    legal_document: {
      templateId: 'legal_document',
      name: 'Legal Document',
      description: 'Store legal documents and contracts',
      category: 'Legal',
      icon: 'Gavel',
      color: '#6a1b9a',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'document_title',
      schema: {
        fields: [
          { id: 'document_title', type: 'text', label: 'Document Title', required: true },
          { id: 'document_type', type: 'text', label: 'Document Type' },
          { id: 'party_names', type: 'textarea', label: 'Party Names' },
          { id: 'date_created', type: 'date', label: 'Date Created' },
          { id: 'expiry_date', type: 'date', label: 'Expiry Date' },
          { id: 'legal_firm', type: 'text', label: 'Legal Firm/Lawyer' },
          { id: 'reference_number', type: 'text', label: 'Reference Number' },
          { id: 'notes', type: 'textarea', label: 'Notes' },
        ],
      },
      defaultData: {},
      tags: ['legal', 'documents'],
    },

    software_license: {
      templateId: 'software_license',
      name: 'Software License',
      description: 'Store software licenses and activation keys',
      category: 'Software',
      icon: 'License',
      color: '#00695c',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'software_name',
      schema: {
        fields: [
          { id: 'software_name', type: 'text', label: 'Software Name', required: true },
          { id: 'license_key', type: 'password', label: 'License Key', sensitive: true, required: true },
          { id: 'activation_code', type: 'password', label: 'Activation Code', sensitive: true },
          { id: 'version', type: 'text', label: 'Version' },
          { id: 'purchase_date', type: 'date', label: 'Purchase Date' },
          { id: 'expiry_date', type: 'date', label: 'Expiry Date' },
          { id: 'vendor', type: 'text', label: 'Vendor/Publisher' },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Installation instructions, special requirements...' },
        ],
      },
      defaultData: {},
      tags: ['software', 'license'],
    },

    insurance_policy: {
      templateId: 'insurance_policy',
      name: 'Insurance Policy',
      description: 'Store insurance policy information',
      category: 'Finance',
      icon: 'Security',
      color: '#1565c0',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'policy_number',
      schema: {
        fields: [
          { id: 'policy_number', type: 'text', label: 'Policy Number', sensitive: true, required: true },
          { id: 'policy_type', type: 'text', label: 'Policy Type' },
          { id: 'insurer', type: 'text', label: 'Insurance Company', required: true },
          { id: 'policy_holder', type: 'text', label: 'Policy Holder' },
          { id: 'coverage_amount', type: 'text', label: 'Coverage Amount' },
          { id: 'premium', type: 'text', label: 'Premium' },
          { id: 'deductible', type: 'text', label: 'Deductible' },
          { id: 'expiry_date', type: 'date', label: 'Expiry Date' },
          { id: 'agent_info', type: 'textarea', label: 'Agent Information' },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Coverage details, exclusions, claims history...' },
        ],
      },
      defaultData: {},
      tags: ['finance', 'insurance'],
    },

    vehicle_info: {
      templateId: 'vehicle_info',
      name: 'Vehicle Info',
      description: 'Store vehicle registration and insurance details',
      category: 'Personal',
      icon: 'DriveEta',
      color: '#424242',
      version: '1.0.0',
      isPublic: true,
      isOfficial: true,
      titleField: 'make',
      schema: {
        fields: [
          { id: 'make', type: 'text', label: 'Make', required: true },
          { id: 'model', type: 'text', label: 'Model', required: true },
          { id: 'year', type: 'text', label: 'Year', required: true },
          { id: 'vin', type: 'text', label: 'VIN', sensitive: true, placeholder: 'Vehicle Identification Number' },
          { id: 'license_plate', type: 'text', label: 'License Plate' },
          { id: 'registration_number', type: 'text', label: 'Registration Number', sensitive: true },
          { id: 'insurance_policy', type: 'text', label: 'Insurance Policy Number', sensitive: true },
          { id: 'insurance_company', type: 'text', label: 'Insurance Company' },
          { id: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Maintenance records, modifications, accidents...' },
        ],
      },
      defaultData: {},
      tags: ['personal', 'vehicle'],
    },
  };
}

/**
 * Get all available template categories
 */
export function getTemplateCategories(): string[] {
  const templates = getBuiltInFormTemplates();
  const categories = new Set<string>();
  
  Object.values(templates).forEach(template => {
    if (template.category) {
      categories.add(template.category);
    }
  });
  
  return Array.from(categories).sort();
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): FormTemplate[] {
  const templates = getBuiltInFormTemplates();
  return Object.values(templates).filter(template => template.category === category);
}

/**
 * Get all templates (only built-in templates now)
 */
export async function getAllTemplates(userId?: string): Promise<{ [key: string]: FormTemplate }> {
  const builtInTemplates = getBuiltInFormTemplates();
  return { ...builtInTemplates };
}

/**
 * Create a form from any template (built-in or custom)
 */
export async function createFormFromTemplate(templateKey: string, formName: string, userId?: string): Promise<import('./formFiles').SecureFormData> {
  const allTemplates = await getAllTemplates(userId);
  const template = allTemplates[templateKey];
  
  if (!template) {
    throw new Error(`Template ${templateKey} not found`);
  }
  
  const now = new Date().toISOString();
  
  return {
    metadata: {
      name: formName,
      description: `Created from template: ${template.name}`,
      category: template.category,
      icon: template.icon,
      color: template.color,
      version: '1.0.0',
      author: userId,
      created: now,
      modified: now,
    },
    template: JSON.parse(JSON.stringify(template)), // Embed the complete template
    schema: JSON.parse(JSON.stringify(template.schema)), // Deep clone
    data: JSON.parse(JSON.stringify(template.defaultData || {})), // Deep clone default data
    attachments: {},
    tags: [...(template.tags || [])],
  };
}

/**
 * Create a form from a built-in template (legacy function for backwards compatibility)
 */
export function createFormFromBuiltInTemplate(templateKey: string, formName: string, userId?: string): import('./formFiles').SecureFormData {
  const templates = getBuiltInFormTemplates();
  const template = templates[templateKey];
  
  if (!template) {
    throw new Error(`Template ${templateKey} not found`);
  }
  
  const now = new Date().toISOString();
  
  return {
    metadata: {
      name: formName,
      description: `Created from template: ${template.name}`,
      category: template.category,
      icon: template.icon,
      color: template.color,
      version: '1.0.0',
      author: userId,
      created: now,
      modified: now,
    },
    template: JSON.parse(JSON.stringify(template)), // Embed the complete template
    schema: JSON.parse(JSON.stringify(template.schema)), // Deep clone
    data: JSON.parse(JSON.stringify(template.defaultData || {})), // Deep clone default data
    attachments: {},
    tags: [...(template.tags || [])],
  };
}