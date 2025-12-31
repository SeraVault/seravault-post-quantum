import type { FileData } from '../files';
import { getFormTypeFromFilename, isFormFile } from './formFiles';
import { getBuiltInFormTemplates } from './embeddedTemplates';

export type StandardFileCategoryId =
  | 'documents'
  | 'images'
  | 'videos'
  | 'audio'
  | 'archives'
  | 'code'
  | 'other';

export type FormCategoryId = string;

export type FileTypeFilterValue =
  | 'all'
  | 'files'
  | `files:${StandardFileCategoryId}`
  | 'forms'
  | `forms:${FormCategoryId}`
  | 'chats';

export type FileTypeCountMap = Record<FileTypeFilterValue, number>;

export const STANDARD_FILE_CATEGORIES: StandardFileCategoryId[] = [
  'documents',
  'images',
  'videos',
  'audio',
  'archives',
  'code',
  'other',
];

const BUILT_IN_TEMPLATE_IDS = Object.keys(getBuiltInFormTemplates());
export const FORM_FILE_CATEGORIES: FormCategoryId[] = Array.from(
  new Set<FormCategoryId>([...BUILT_IN_TEMPLATE_IDS, 'custom'])
);

const STANDARD_CATEGORY_EXTENSION_MAP: Record<StandardFileCategoryId, string[]> = {
  documents: [
    'pdf',
    'doc',
    'docx',
    'txt',
    'rtf',
    'odt',
    'xls',
    'xlsx',
    'csv',
    'ppt',
    'pptx',
    'md',
    'pages',
    'numbers',
    'key',
  ],
  images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'heic', 'tif', 'tiff'],
  videos: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
  code: [
    'js',
    'ts',
    'tsx',
    'jsx',
    'json',
    'yml',
    'yaml',
    'xml',
    'html',
    'css',
    'c',
    'cpp',
    'h',
    'hpp',
    'py',
    'rb',
    'go',
    'java',
    'kt',
    'swift',
    'rs',
  ],
  other: [],
};

const FORM_CATEGORY_ALIAS_MAP: Record<string, FormCategoryId> = {
  note: 'secure_note',
  notes: 'secure_note',
  wifi_network: 'wifi',
  wifi_networks: 'wifi',
  wifinetwork: 'wifi',
  wifinet: 'wifi',
  creditcard: 'credit_card',
  creditcardinfo: 'credit_card',
  bank: 'bank_account',
  bankdetails: 'bank_account',
  identity_card: 'identity',
  id: 'identity',
  legal_document: 'legal_document',
  legal: 'legal_document',
  will: 'will_testament',
  testament: 'will_testament',
  poa: 'power_of_attorney',
  attorney: 'power_of_attorney',
  ip: 'intellectual_property',
  patent: 'intellectual_property',
  trademark: 'intellectual_property',
  copyright: 'intellectual_property',
  insurance_policy: 'insurance',
  software: 'software_license',
  software_license_key: 'software_license',
  vehicle_info: 'vehicle',
  vehicle: 'vehicle_info',
  api: 'api_credentials',
  api_key: 'api_credentials',
  ssh: 'ssh_key',
  sshkey: 'ssh_key',
  database: 'database_credentials',
  db: 'database_credentials',
  server: 'server_credentials',
  vpn: 'vpn_credentials',
  encryption: 'encryption_keys',
  pgp: 'encryption_keys',
  gpg: 'encryption_keys',
  emergency: 'emergency_contacts',
  domain: 'domain_registration',
  '2fa': 'two_factor_backup',
  twofa: 'two_factor_backup',
  backup_codes: 'two_factor_backup',
  business: 'business_license',
  license: 'business_license',
  membership: 'membership_subscription',
  subscription: 'membership_subscription',
  loyalty: 'loyalty_program',
  rewards: 'loyalty_program',
  passport: 'passport',
  visa: 'travel_visa',
  travel_document: 'travel_visa',
  frequent_flyer: 'frequent_flyer',
  airline: 'frequent_flyer',
  miles: 'frequent_flyer',
  professional_license: 'professional_license',
  certification: 'professional_license',
  education: 'education_record',
  degree: 'education_record',
  transcript: 'education_record',
};

const FORM_CATEGORY_SET = new Set<FormCategoryId>(FORM_FILE_CATEGORIES);

const createEmptyCounts = (): FileTypeCountMap => {
  const counts: Partial<FileTypeCountMap> = {
    all: 0,
    files: 0,
    forms: 0,
    chats: 0,
  };

  STANDARD_FILE_CATEGORIES.forEach((category) => {
    counts[`files:${category}` as FileTypeFilterValue] = 0;
  });

  FORM_FILE_CATEGORIES.forEach((category) => {
    counts[`forms:${category}` as FileTypeFilterValue] = 0;
  });

  return counts as FileTypeCountMap;
};

interface ClassifiedFile {
  isChat: boolean;
  isForm: boolean;
  formCategory?: FormCategoryId;
  standardCategory: StandardFileCategoryId;
}

const getFileName = (file: FileData): string => {
  if (typeof file.name === 'string') {
    return file.name;
  }
  return '';
};

const getFileExtension = (fileName: string): string => {
  const parts = fileName.toLowerCase().split('.');
  if (parts.length <= 1) {
    return '';
  }
  return parts.pop() || '';
};

const normalizeFormCategory = (rawCategory: string | null): FormCategoryId => {
  if (!rawCategory) {
    return 'custom';
  }

  const cleaned = rawCategory.toLowerCase().replace(/[\s-]/g, '_');
  if (FORM_CATEGORY_SET.has(cleaned as FormCategoryId)) {
    return cleaned as FormCategoryId;
  }

  return FORM_CATEGORY_ALIAS_MAP[cleaned] || 'custom';
};

const detectStandardCategory = (extension: string): StandardFileCategoryId => {
  if (!extension) {
    return 'other';
  }

  const matched = STANDARD_FILE_CATEGORIES.find((category) => {
    if (category === 'other') {
      return false;
    }
    return STANDARD_CATEGORY_EXTENSION_MAP[category].includes(extension);
  });

  return matched || 'other';
};

const classifyFile = (file: FileData): ClassifiedFile => {
  const asAny = file as FileData & { fileType?: string };
  const isChat = asAny.fileType === 'chat';
  const isAttachment = asAny.fileType === 'attachment';
  const fileName = getFileName(file);

  const isForm =
    !isChat && !isAttachment &&
    (asAny.fileType === 'form' ||
      (fileName ? isFormFile(fileName) : false));

  let formCategory: FormCategoryId | undefined;

  if (isForm && fileName) {
    const extractedCategory = getFormTypeFromFilename(fileName);
    formCategory = normalizeFormCategory(extractedCategory);
  }

  const extension = getFileExtension(fileName);
  const standardCategory = isForm || isChat ? 'other' : detectStandardCategory(extension);

  return {
    isChat,
    isForm,
    formCategory,
    standardCategory,
  };
};

export const matchesFileTypeFilter = (
  file: FileData,
  filter?: FileTypeFilterValue | null
): boolean => {
  if (!filter || filter === 'all') {
    return true;
  }

  const classification = classifyFile(file);

  if (filter === 'chats') {
    return classification.isChat;
  }

  if (filter === 'files') {
    return !classification.isChat && !classification.isForm;
  }

  if (filter.startsWith('files:')) {
    const category = filter.split(':')[1] as StandardFileCategoryId;
    return !classification.isChat && !classification.isForm && classification.standardCategory === category;
  }

  if (filter === 'forms') {
    return classification.isForm;
  }

  if (filter.startsWith('forms:')) {
    const category = filter.split(':')[1] as FormCategoryId;
    return classification.isForm && classification.formCategory === category;
  }

  return true;
};

export const buildFileTypeCounts = (files: FileData[] = []): FileTypeCountMap => {
  const counts = createEmptyCounts();
  counts.all = files.length;

  files.forEach((file) => {
    const classification = classifyFile(file);

    if (classification.isChat) {
      counts.chats += 1;
      return;
    }

    if (classification.isForm) {
      counts.forms += 1;
      const key = `forms:${classification.formCategory || 'custom'}` as FileTypeFilterValue;
      counts[key] = (counts[key] || 0) + 1;
      return;
    }

    counts.files += 1;
    const key = `files:${classification.standardCategory}` as FileTypeFilterValue;
    counts[key] = (counts[key] || 0) + 1;
  });

  return counts;
};
