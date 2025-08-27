/**
 * Form utilities that treat forms as JSON files using existing file encryption/sharing
 */

import { createFileWithSharing } from '../files';
import { uploadFileData } from '../storage';
import { getUserProfile } from '../firestore';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { encryptMetadata } from '../crypto/postQuantumCrypto';
import { useTranslation } from 'react-i18next';

export interface FormFieldDefinition {
  id: string;
  type: 'text' | 'password' | 'email' | 'number' | 'date' | 'select' | 'textarea' | 'richtext' | 'file';
  label: string;
  placeholder?: string;
  required?: boolean;
  sensitive?: boolean; // For fields like passwords, card numbers
  options?: string[]; // For select fields
  fileConfig?: { // Configuration for file fields
    maxFiles?: number; // Maximum number of files allowed (default: 5)
    maxFileSize?: number; // Maximum file size in bytes (default: 10MB)
    allowedTypes?: string[]; // Allowed MIME types (default: all)
    description?: string; // Help text for file upload
  };
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    customMessage?: string;
  };
}

export interface FormField extends FormFieldDefinition {
  value: string | string[]; // string for regular fields, string[] for file field (file IDs)
}

export interface AttachedFile {
  id: string; // File ID from the files collection
  originalName: string; // Original filename when uploaded
  size: number; // File size in bytes
  mimeType?: string; // MIME type
  uploadedAt: string; // ISO timestamp
}

export interface FormMetadata {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  version: string;
  author?: string;
  created: string;
  modified: string;
}

export interface FormLocalization {
  [fieldId: string]: {
    label?: string;
    placeholder?: string;
    options?: string[];
    description?: string;
  };
}

export interface SecureFormData {
  // Form metadata
  metadata: FormMetadata;
  
  // Form structure definition
  schema: {
    fields: FormFieldDefinition[];
    sections?: {
      id: string;
      title: string;
      fieldIds: string[];
      collapsible?: boolean;
    }[];
  };
  
  // User's data for this form instance
  data: {
    [fieldId: string]: string | string[]; // string for regular fields, string[] for file field IDs
  };
  
  // File attachments metadata (keyed by file ID)
  attachments?: {
    [fileId: string]: AttachedFile;
  };
  
  // User-defined localization
  localization?: {
    [locale: string]: {
      metadata?: Partial<FormMetadata>;
      fields?: FormLocalization;
      sections?: { [sectionId: string]: string };
    };
  };
  
  // Instance-specific metadata
  tags?: string[];
  favorite?: boolean;
  lastAccessed?: string;
}

/**
 * Create a new blank form
 */
export function createBlankForm(name: string, author?: string): SecureFormData {
  const now = new Date().toISOString();
  
  return {
    metadata: {
      name,
      version: '1.0.0',
      author,
      created: now,
      modified: now,
    },
    schema: {
      fields: [],
    },
    data: {},
    attachments: {},
    tags: [],
  };
}

/**
 * Create common form templates that users can use as starting points
 */
export function getCommonFormTemplates(t?: (key: string, fallback?: string) => string): { [key: string]: SecureFormData } {
  const now = new Date().toISOString();
  
  // Fallback function if no translation is provided
  const translate = (key: string, fallback?: string) => {
    if (t) return t(key);
    // Extract the last part of the key as fallback
    return fallback || key.split('.').pop() || key;
  };
  
  return {
    credit_card: {
      metadata: {
        name: translate('forms.formTypes.creditCard', 'Credit Card'),
        description: translate('forms.formDescriptions.creditCard', 'Store credit card information securely'),
        category: 'Finance',
        icon: 'CreditCard',
        color: '#1976d2',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'card_name', type: 'text', label: translate('forms.templateFields.creditCard.cardName', 'Card Name'), required: true, placeholder: 'e.g., Personal Visa' },
          { id: 'cardholder_name', type: 'text', label: translate('forms.templateFields.creditCard.cardholderName', 'Cardholder Name'), required: true },
          { id: 'card_number', type: 'text', label: translate('forms.templateFields.creditCard.cardNumber', 'Card Number'), sensitive: true, required: true, placeholder: '1234 5678 9012 3456' },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.creditCard.expiryDate', 'Expiry Date'), required: true },
          { id: 'cvv', type: 'password', label: translate('forms.templateFields.creditCard.cvv', 'CVV'), sensitive: true, required: true },
          { id: 'pin', type: 'text', label: translate('forms.templateFields.creditCard.pin', 'PIN'), sensitive: true, placeholder: '4 digits' },
          { id: 'bank_name', type: 'text', label: translate('forms.templateFields.creditCard.bankName', 'Bank Name') },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.creditCard.notes', 'Notes'), placeholder: 'Additional notes...' },
        ],
      },
      data: {},
      tags: [],
    },
    
    password: {
      metadata: {
        name: translate('forms.formTypes.password', 'Password'),
        description: translate('forms.formDescriptions.password', 'Store login credentials securely'),
        category: 'Security',
        icon: 'Lock',
        color: '#d32f2f',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'site_service', type: 'text', label: translate('forms.templateFields.password.siteName', 'Site/Service'), required: true, placeholder: 'e.g., Gmail, Facebook' },
          { id: 'website_url', type: 'text', label: translate('forms.templateFields.password.url', 'Website URL'), placeholder: 'https://example.com' },
          { id: 'username', type: 'text', label: translate('forms.templateFields.password.username', 'Username'), required: true },
          { id: 'email', type: 'text', label: translate('forms.templateFields.password.email', 'Email') },
          { id: 'password', type: 'password', label: translate('forms.templateFields.password.password', 'Password'), sensitive: true, required: true },
          { id: 'security_q1', type: 'text', label: translate('forms.templateFields.password.securityQuestion1', 'Security Question 1') },
          { id: 'security_a1', type: 'text', label: translate('forms.templateFields.password.securityAnswer1', 'Security Answer 1'), sensitive: true },
          { id: 'security_q2', type: 'text', label: translate('forms.templateFields.password.securityQuestion2', 'Security Question 2') },
          { id: 'security_a2', type: 'text', label: translate('forms.templateFields.password.securityAnswer2', 'Security Answer 2'), sensitive: true },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.password.notes', 'Notes'), placeholder: 'Additional notes...' },
        ],
      },
      data: {},
      tags: [],
    },
    
    secure_note: {
      metadata: {
        name: translate('forms.formTypes.secureNote', 'Secure Note'),
        description: translate('forms.formDescriptions.secureNote', 'Store rich text notes securely'),
        category: 'Notes',
        icon: 'StickyNote2',
        color: '#7b1fa2',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'title', type: 'text', label: translate('forms.templateFields.secureNote.title', 'Title'), required: true },
          { id: 'content', type: 'richtext', label: translate('forms.templateFields.secureNote.content', 'Content'), required: true, placeholder: 'Your secure note content with rich formatting...' },
          { id: 'tags', type: 'text', label: translate('forms.templateFields.secureNote.tags', 'Tags') },
        ],
      },
      data: {},
      tags: [],
    },

    bank_account: {
      metadata: {
        name: translate('forms.formTypes.bankAccount', 'Bank Account'),
        description: translate('forms.formDescriptions.bankAccount', 'Store banking information securely'),
        category: 'Finance',
        icon: 'AccountBalance',
        color: '#388e3c',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'account_name', type: 'text', label: translate('forms.templateFields.bankAccount.accountName', 'Account Name'), required: true, placeholder: 'e.g., Personal Checking' },
          { id: 'bank_name', type: 'text', label: translate('forms.templateFields.bankAccount.bankName', 'Bank Name'), required: true },
          { id: 'account_number', type: 'text', label: translate('forms.templateFields.bankAccount.accountNumber', 'Account Number'), sensitive: true, required: true },
          { id: 'routing_number', type: 'text', label: translate('forms.templateFields.bankAccount.routingNumber', 'Routing Number'), required: true },
          { id: 'account_type', type: 'text', label: translate('forms.templateFields.bankAccount.accountType', 'Account Type') },
          { id: 'swift_bic', type: 'text', label: translate('forms.templateFields.bankAccount.swiftBic', 'SWIFT/BIC Code'), placeholder: 'For international transfers' },
          { id: 'iban', type: 'text', label: translate('forms.templateFields.bankAccount.iban', 'IBAN'), placeholder: 'International Bank Account Number' },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.bankAccount.notes', 'Notes'), placeholder: 'Additional banking information...' },
        ],
      },
      data: {},
      tags: [],
    },

    identity: {
      metadata: {
        name: translate('forms.formTypes.identity', 'Identity Document'),
        description: translate('forms.formDescriptions.identity', 'Store personal identification documents'),
        category: 'Personal',
        icon: 'Person',
        color: '#f57c00',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'full_name', type: 'text', label: translate('forms.templateFields.identity.fullName', 'Full Name'), required: true },
          { id: 'ssn', type: 'text', label: translate('forms.templateFields.identity.ssn', 'Social Security Number'), sensitive: true },
          { id: 'passport_number', type: 'text', label: translate('forms.templateFields.identity.passportNumber', 'Passport Number'), sensitive: true },
          { id: 'passport_expiry', type: 'date', label: translate('forms.templateFields.identity.passportExpiry', 'Passport Expiry') },
          { id: 'driver_license', type: 'text', label: translate('forms.templateFields.identity.driverLicense', 'Driver License Number'), sensitive: true },
          { id: 'license_expiry', type: 'date', label: translate('forms.templateFields.identity.licenseExpiry', 'License Expiry') },
          { id: 'national_id', type: 'text', label: translate('forms.templateFields.identity.nationalId', 'National ID'), sensitive: true },
          { id: 'date_of_birth', type: 'date', label: translate('forms.templateFields.identity.dateOfBirth', 'Date of Birth') },
          { id: 'address', type: 'textarea', label: translate('forms.templateFields.identity.address', 'Address') },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.identity.notes', 'Notes'), placeholder: 'Additional identification details...' },
        ],
      },
      data: {},
      tags: [],
    },

    wifi_network: {
      metadata: {
        name: translate('forms.formTypes.wifiNetwork', 'WiFi Network'),
        description: translate('forms.formDescriptions.wifiNetwork', 'Store WiFi network credentials and settings'),
        category: 'Network',
        icon: 'Wifi',
        color: '#0288d1',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'network_name', type: 'text', label: translate('forms.templateFields.wifiNetwork.networkName', 'Network Name (SSID)'), required: true },
          { id: 'password', type: 'password', label: translate('forms.templateFields.wifiNetwork.password', 'WiFi Password'), sensitive: true, required: true },
          { id: 'security_type', type: 'text', label: translate('forms.templateFields.wifiNetwork.securityType', 'Security Type') },
          { id: 'router_ip', type: 'text', label: translate('forms.templateFields.wifiNetwork.routerIp', 'Router IP Address'), placeholder: 'e.g., 192.168.1.1' },
          { id: 'admin_username', type: 'text', label: translate('forms.templateFields.wifiNetwork.adminUsername', 'Admin Username') },
          { id: 'admin_password', type: 'password', label: translate('forms.templateFields.wifiNetwork.adminPassword', 'Admin Password'), sensitive: true },
          { id: 'wps_pin', type: 'text', label: translate('forms.templateFields.wifiNetwork.wpsPin', 'WPS PIN'), sensitive: true },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.wifiNetwork.notes', 'Notes'), placeholder: 'Network configuration details...' },
        ],
      },
      data: {},
      tags: [],
    },

    crypto_wallet: {
      metadata: {
        name: translate('forms.formTypes.cryptoWallet', 'Crypto Wallet'),
        description: translate('forms.formDescriptions.cryptoWallet', 'Store cryptocurrency wallet information'),
        category: 'Crypto',
        icon: 'AccountBalanceWallet',
        color: '#ff9800',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'wallet_name', type: 'text', label: translate('forms.templateFields.cryptoWallet.walletName', 'Wallet Name'), required: true, placeholder: 'e.g., Bitcoin Main Wallet' },
          { id: 'wallet_type', type: 'text', label: translate('forms.templateFields.cryptoWallet.walletType', 'Wallet Type') },
          { id: 'seed_phrase', type: 'textarea', label: translate('forms.templateFields.cryptoWallet.seedPhrase', 'Seed Phrase'), sensitive: true, placeholder: '12 or 24 word recovery phrase' },
          { id: 'private_key', type: 'password', label: translate('forms.templateFields.cryptoWallet.privateKey', 'Private Key'), sensitive: true, required: true },
          { id: 'public_address', type: 'text', label: translate('forms.templateFields.cryptoWallet.publicAddress', 'Public Address'), required: true },
          { id: 'passphrase', type: 'password', label: translate('forms.templateFields.cryptoWallet.passphrase', 'Passphrase'), sensitive: true },
          { id: 'pin_code', type: 'password', label: translate('forms.templateFields.cryptoWallet.pinCode', 'PIN Code'), sensitive: true },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.cryptoWallet.notes', 'Notes'), placeholder: 'Wallet configuration and backup information...' },
        ],
      },
      data: {},
      tags: [],
    },

    medical_record: {
      metadata: {
        name: translate('forms.formTypes.medicalRecord', 'Medical Record'),
        description: translate('forms.formDescriptions.medicalRecord', 'Store medical and health information with documents'),
        category: 'Health',
        icon: 'LocalHospital',
        color: '#e53935',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'patient_name', type: 'text', label: translate('forms.templateFields.medicalRecord.patientName', 'Patient Name'), required: true },
          { id: 'patient_id', type: 'text', label: translate('forms.templateFields.medicalRecord.patientId', 'Patient ID'), sensitive: true },
          { id: 'provider_name', type: 'text', label: translate('forms.templateFields.medicalRecord.providerName', 'Healthcare Provider') },
          { id: 'allergies', type: 'textarea', label: translate('forms.templateFields.medicalRecord.allergies', 'Allergies'), placeholder: 'Known allergies and reactions...' },
          { id: 'medications', type: 'textarea', label: translate('forms.templateFields.medicalRecord.medications', 'Current Medications') },
          { id: 'conditions', type: 'textarea', label: translate('forms.templateFields.medicalRecord.conditions', 'Medical Conditions'), placeholder: 'Chronic conditions, diagnoses...' },
          { id: 'emergency_contact', type: 'text', label: translate('forms.templateFields.medicalRecord.emergencyContact', 'Emergency Contact') },
          { id: 'insurance_info', type: 'textarea', label: translate('forms.templateFields.medicalRecord.insuranceInfo', 'Insurance Information') },
          { id: 'medical_documents', type: 'file', label: translate('forms.templateFields.medicalRecord.documents', 'Medical Documents'), 
            fileConfig: { 
              maxFiles: 10, 
              maxFileSize: 50 * 1024 * 1024, // 50MB 
              allowedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'text/plain'],
              description: 'Upload medical documents, test results, X-rays, etc. (PDF, images, text files)'
            }
          },
          { id: 'notes', type: 'richtext', label: translate('forms.templateFields.medicalRecord.notes', 'Notes'), placeholder: 'Detailed medical history, procedures, test results...' },
        ],
      },
      data: {
        medical_documents: [] // Initialize file field as empty array
      },
      attachments: {},
      tags: [],
    },

    legal_document: {
      metadata: {
        name: translate('forms.formTypes.legalDocument', 'Legal Document'),
        description: translate('forms.formDescriptions.legalDocument', 'Store legal documents and contracts'),
        category: 'Legal',
        icon: 'Gavel',
        color: '#6a1b9a',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'document_title', type: 'text', label: translate('forms.templateFields.legalDocument.documentTitle', 'Document Title'), required: true },
          { id: 'document_type', type: 'text', label: translate('forms.templateFields.legalDocument.documentType', 'Document Type') },
          { id: 'party_names', type: 'textarea', label: translate('forms.templateFields.legalDocument.partyNames', 'Party Names') },
          { id: 'date_created', type: 'date', label: translate('forms.templateFields.legalDocument.dateCreated', 'Date Created') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.legalDocument.expiryDate', 'Expiry Date') },
          { id: 'legal_firm', type: 'text', label: translate('forms.templateFields.legalDocument.legalFirm', 'Legal Firm/Lawyer') },
          { id: 'reference_number', type: 'text', label: translate('forms.templateFields.legalDocument.referenceNumber', 'Reference Number') },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.legalDocument.notes', 'Notes') },
        ],
      },
      data: {},
      tags: [],
    },

    software_license: {
      metadata: {
        name: translate('forms.formTypes.softwareLicense', 'Software License'),
        description: translate('forms.formDescriptions.softwareLicense', 'Store software licenses and activation keys'),
        category: 'Software',
        icon: 'License',
        color: '#00695c',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'software_name', type: 'text', label: translate('forms.templateFields.softwareLicense.softwareName', 'Software Name'), required: true },
          { id: 'license_key', type: 'password', label: translate('forms.templateFields.softwareLicense.licenseKey', 'License Key'), sensitive: true, required: true },
          { id: 'activation_code', type: 'password', label: translate('forms.templateFields.softwareLicense.activationCode', 'Activation Code'), sensitive: true },
          { id: 'version', type: 'text', label: translate('forms.templateFields.softwareLicense.version', 'Version') },
          { id: 'purchase_date', type: 'date', label: translate('forms.templateFields.softwareLicense.purchaseDate', 'Purchase Date') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.softwareLicense.expiryDate', 'Expiry Date') },
          { id: 'vendor', type: 'text', label: translate('forms.templateFields.softwareLicense.vendor', 'Vendor/Publisher') },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.softwareLicense.notes', 'Notes'), placeholder: 'Installation instructions, special requirements...' },
        ],
      },
      data: {},
      tags: [],
    },

    insurance_policy: {
      metadata: {
        name: translate('forms.formTypes.insurancePolicy', 'Insurance Policy'),
        description: translate('forms.formDescriptions.insurancePolicy', 'Store insurance policy information'),
        category: 'Finance',
        icon: 'Security',
        color: '#1565c0',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'policy_number', type: 'text', label: translate('forms.templateFields.insurancePolicy.policyNumber', 'Policy Number'), sensitive: true, required: true },
          { id: 'policy_type', type: 'text', label: translate('forms.templateFields.insurancePolicy.policyType', 'Policy Type') },
          { id: 'insurer', type: 'text', label: translate('forms.templateFields.insurancePolicy.insurer', 'Insurance Company'), required: true },
          { id: 'policy_holder', type: 'text', label: translate('forms.templateFields.insurancePolicy.policyHolder', 'Policy Holder') },
          { id: 'coverage_amount', type: 'text', label: translate('forms.templateFields.insurancePolicy.coverageAmount', 'Coverage Amount') },
          { id: 'premium', type: 'text', label: translate('forms.templateFields.insurancePolicy.premium', 'Premium') },
          { id: 'deductible', type: 'text', label: translate('forms.templateFields.insurancePolicy.deductible', 'Deductible') },
          { id: 'expiry_date', type: 'date', label: translate('forms.templateFields.insurancePolicy.expiryDate', 'Expiry Date') },
          { id: 'agent_info', type: 'textarea', label: translate('forms.templateFields.insurancePolicy.agentInfo', 'Agent Information') },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.insurancePolicy.notes', 'Notes'), placeholder: 'Coverage details, exclusions, claims history...' },
        ],
      },
      data: {},
      tags: [],
    },

    vehicle_info: {
      metadata: {
        name: translate('forms.formTypes.vehicleInfo', 'Vehicle Info'),
        description: translate('forms.formDescriptions.vehicleInfo', 'Store vehicle registration and insurance details'),
        category: 'Personal',
        icon: 'DriveEta',
        color: '#424242',
        version: '1.0.0',
        created: now,
        modified: now,
      },
      schema: {
        fields: [
          { id: 'make', type: 'text', label: translate('forms.templateFields.vehicleInfo.vehicleMake', 'Make'), required: true },
          { id: 'model', type: 'text', label: translate('forms.templateFields.vehicleInfo.vehicleModel', 'Model'), required: true },
          { id: 'year', type: 'text', label: translate('forms.templateFields.vehicleInfo.year', 'Year'), required: true },
          { id: 'vin', type: 'text', label: translate('forms.templateFields.vehicleInfo.vin', 'VIN'), sensitive: true, placeholder: 'Vehicle Identification Number' },
          { id: 'license_plate', type: 'text', label: translate('forms.templateFields.vehicleInfo.licensePlate', 'License Plate') },
          { id: 'registration_number', type: 'text', label: translate('forms.templateFields.vehicleInfo.registrationNumber', 'Registration Number'), sensitive: true },
          { id: 'insurance_policy', type: 'text', label: translate('forms.templateFields.vehicleInfo.insurancePolicy', 'Insurance Policy Number'), sensitive: true },
          { id: 'insurance_company', type: 'text', label: translate('forms.templateFields.vehicleInfo.insuranceCompany', 'Insurance Company') },
          { id: 'notes', type: 'textarea', label: translate('forms.templateFields.vehicleInfo.notes', 'Notes'), placeholder: 'Maintenance records, modifications, accidents...' },
        ],
      },
      data: {},
      tags: [],
    },
  };
}

/**
 * Create a new form from template
 */
export function createFormFromTemplate(templateKey: string, name?: string, t?: (key: string, fallback?: string) => string): SecureFormData {
  const templates = getCommonFormTemplates(t);
  const template = templates[templateKey];
  
  if (!template) {
    throw new Error(`Template ${templateKey} not found`);
  }
  
  const formData = JSON.parse(JSON.stringify(template)); // Deep clone
  
  if (name) {
    formData.metadata.name = name;
  }
  
  // Reset timestamps
  const now = new Date().toISOString();
  formData.metadata.created = now;
  formData.metadata.modified = now;
  
  return formData;
}

// Helper functions for encryption (copied from MainContent pattern)
const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array) =>
  bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

/**
 * Save form data as a JSON file using existing file encryption
 * @returns The file ID of the created form file
 */
export async function saveFormAsFile(
  formData: SecureFormData,
  userId: string,
  _privateKey: string,
  parentFolder: string | null = null
): Promise<string> {
  try {
    // Get user profile for public key
    const userProfile = await getUserProfile(userId);
    if (!userProfile?.publicKey) {
      throw new Error('Public key not found for the user.');
    }

    // Update timestamp
    const updatedFormData = {
      ...formData,
      metadata: {
        ...formData.metadata,
        modified: new Date().toISOString(),
      },
    };

    // Create JSON content
    const jsonString = JSON.stringify(updatedFormData, null, 2);
    
    // Encrypt the file content using the same pattern as regular files
    const publicKey = hexToBytes(userProfile.publicKey);
    const kemResult = ml_kem768.encapsulate(publicKey);

    if (!kemResult || !kemResult.cipherText || !kemResult.sharedSecret) {
      throw new Error('Encryption key generation failed.');
    }

    const { cipherText, sharedSecret } = kemResult;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['encrypt']);
    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, 
      key, 
      new TextEncoder().encode(jsonString)
    );

    // Create filename and encrypt metadata
    const fileName = `${formData.metadata.name}.form`;
    const { encryptedName, encryptedSize, nonce } = encryptMetadata(
      { name: fileName, size: jsonString.length.toString() },
      sharedSecret
    );

    // Use the same storage path pattern as regular files
    const storagePath = `files/${userId}/${crypto.randomUUID()}`;
    
    // Combine IV and encrypted content (same format as regular files)
    const combinedData = new Uint8Array(iv.length + encryptedContent.byteLength);
    combinedData.set(iv, 0);
    combinedData.set(new Uint8Array(encryptedContent), iv.length);
    
    // Upload encrypted content to storage
    await uploadFileData(storagePath, combinedData);

    // Create file record using existing file sharing system
    const fileId = await createFileWithSharing({
      owner: userId,
      name: { ciphertext: encryptedName, nonce: nonce },
      parent: parentFolder,
      size: { ciphertext: encryptedSize, nonce: nonce },
      storagePath,
      encryptedKeys: { [userId]: bytesToHex(cipherText) },
      sharedWith: [userId],
    });

    return fileId;
  } catch (error) {
    console.error('Error saving form as file:', error);
    throw error;
  }
}

/**
 * Load form data from a JSON file
 */
export async function loadFormFromFile(fileContent: string): Promise<SecureFormData> {
  try {
    const formData = JSON.parse(fileContent) as SecureFormData;
    
    // Validate the form data structure
    if (!formData.metadata?.name || !formData.schema?.fields || !formData.data) {
      throw new Error('Invalid form data structure');
    }
    
    // Update last accessed timestamp
    if (formData.lastAccessed) {
      formData.lastAccessed = new Date().toISOString();
    }
    
    return formData;
  } catch (error) {
    console.error('Error parsing form data:', error);
    throw new Error('Failed to load form data');
  }
}

/**
 * Check if a file is a form file based on extension
 */
export function isFormFile(fileName: string): boolean {
  return fileName.endsWith('.form');
}

/**
 * Get display name from form filename
 */
export function getFormDisplayName(fileName: string): string {
  // Remove the .form extension
  return fileName.replace(/\.form$/, '');
}

/**
 * Add a custom field to a form schema
 */
export function addFormField(
  formData: SecureFormData,
  fieldDefinition: Omit<FormFieldDefinition, 'id'>
): SecureFormData {
  const fieldId = `field_${Date.now()}`;
  const newField: FormFieldDefinition = {
    id: fieldId,
    ...fieldDefinition,
  };

  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: [...formData.schema.fields, newField],
    },
    data: {
      ...formData.data,
      [fieldId]: fieldDefinition.type === 'file' ? [] : '', // Initialize array for file fields, string for others
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Remove a field from a form schema
 */
export function removeFormField(formData: SecureFormData, fieldId: string): SecureFormData {
  const updatedData = { ...formData.data };
  delete updatedData[fieldId];

  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: formData.schema.fields.filter(field => field.id !== fieldId),
    },
    data: updatedData,
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Update a field definition in a form schema
 */
export function updateFormField(
  formData: SecureFormData,
  fieldId: string,
  updates: Partial<FormFieldDefinition>
): SecureFormData {
  return {
    ...formData,
    schema: {
      ...formData.schema,
      fields: formData.schema.fields.map(field =>
        field.id === fieldId ? { ...field, ...updates } : field
      ),
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Update field data (user's input)
 */
export function updateFormData(
  formData: SecureFormData,
  fieldId: string,
  value: string | string[]
): SecureFormData {
  return {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: value,
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Add a file attachment to a form
 */
export function addFileAttachment(
  formData: SecureFormData,
  fieldId: string,
  fileId: string,
  fileMetadata: Omit<AttachedFile, 'id'>
): SecureFormData {
  const field = formData.schema.fields.find(f => f.id === fieldId);
  if (!field || field.type !== 'file') {
    throw new Error('Field is not a file field');
  }

  const currentFiles = (formData.data[fieldId] as string[]) || [];
  const maxFiles = field.fileConfig?.maxFiles || 5;
  
  if (currentFiles.length >= maxFiles) {
    throw new Error(`Maximum ${maxFiles} files allowed`);
  }

  const attachment: AttachedFile = {
    id: fileId,
    ...fileMetadata,
  };

  return {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: [...currentFiles, fileId],
    },
    attachments: {
      ...formData.attachments,
      [fileId]: attachment,
    },
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Remove a file attachment from a form
 */
export function removeFileAttachment(
  formData: SecureFormData,
  fieldId: string,
  fileId: string
): SecureFormData {
  const currentFiles = (formData.data[fieldId] as string[]) || [];
  const updatedFiles = currentFiles.filter(id => id !== fileId);
  
  const updatedAttachments = { ...formData.attachments };
  delete updatedAttachments[fileId];

  return {
    ...formData,
    data: {
      ...formData.data,
      [fieldId]: updatedFiles,
    },
    attachments: updatedAttachments,
    metadata: {
      ...formData.metadata,
      modified: new Date().toISOString(),
    },
  };
}

/**
 * Get file attachments for a specific field
 */
export function getFieldAttachments(
  formData: SecureFormData,
  fieldId: string
): AttachedFile[] {
  const fileIds = (formData.data[fieldId] as string[]) || [];
  return fileIds
    .map(fileId => formData.attachments?.[fileId])
    .filter((attachment): attachment is AttachedFile => attachment !== undefined);
}

/**
 * Validate form data
 */
export function validateForm(formData: SecureFormData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!formData.metadata.name.trim()) {
    errors.push('Form title is required');
  }

  formData.schema.fields.forEach((field) => {
    const value = formData.data[field.id];
    
    // Handle file fields separately
    if (field.type === 'file') {
      const fileIds = (value as string[]) || [];
      if (field.required && fileIds.length === 0) {
        errors.push(`${field.label} is required`);
      }
      return;
    }
    
    // Handle regular text fields
    const textValue = value as string || '';
    if (field.required && !textValue.trim()) {
      errors.push(`${field.label} is required`);
    }

    if (textValue) {
      // Validate email fields
      if (field.type === 'email' && !/\S+@\S+\.\S+/.test(textValue)) {
        errors.push(`${field.label} must be a valid email address`);
      }

      // Validate date fields
      if (field.type === 'date' && isNaN(Date.parse(textValue))) {
        errors.push(`${field.label} must be a valid date`);
      }

      // Validate number fields
      if (field.type === 'number' && isNaN(Number(textValue))) {
        errors.push(`${field.label} must be a valid number`);
      }

      // Validate custom validation rules
      if (field.validation) {
        const validation = field.validation;
        
        if (validation.minLength && textValue.length < validation.minLength) {
          errors.push(validation.customMessage || `${field.label} must be at least ${validation.minLength} characters long`);
        }
        
        if (validation.maxLength && textValue.length > validation.maxLength) {
          errors.push(validation.customMessage || `${field.label} must be no more than ${validation.maxLength} characters long`);
        }
        
        if (validation.pattern && !new RegExp(validation.pattern).test(textValue)) {
          errors.push(validation.customMessage || `${field.label} has an invalid format`);
        }
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get localized field definition
 */
export function getLocalizedField(
  formData: SecureFormData,
  fieldId: string,
  locale: string = 'en'
): FormFieldDefinition {
  const field = formData.schema.fields.find(f => f.id === fieldId);
  if (!field) {
    throw new Error(`Field ${fieldId} not found`);
  }

  const localization = formData.localization?.[locale]?.fields?.[fieldId];
  if (!localization) {
    return field;
  }

  return {
    ...field,
    label: localization.label || field.label,
    placeholder: localization.placeholder || field.placeholder,
    options: localization.options || field.options,
  };
}