/**
 * Form Template Service - Database-stored form templates with public/private access control
 */

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  FieldValue 
} from 'firebase/firestore';
import { db } from '../firebase';
import type { FormFieldDefinition, SecureFormData } from '../utils/formFiles';

export interface FormTemplate {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  version: string;
  author: string; // User ID of the creator
  isPublic: boolean; // Public templates can be used by everyone
  isOfficial: boolean; // Official templates (can only be created by admins)
  
  // Template structure
  schema: {
    fields: FormFieldDefinition[];
    sections?: {
      id: string;
      title: string;
      fieldIds: string[];
      collapsible?: boolean;
    }[];
  };
  
  // Default data structure (usually empty)
  defaultData: {
    [fieldId: string]: string | string[];
  };
  
  // Usage statistics
  usageCount: number;
  lastUsed?: FieldValue;
  
  // Timestamps
  createdAt: FieldValue;
  updatedAt: FieldValue;
  
  // Access control
  sharedWith?: string[]; // User IDs who can access private templates
  tags?: string[];
}

export interface CreateTemplateData {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  schema: FormTemplate['schema'];
  defaultData?: FormTemplate['defaultData'];
  isPublic?: boolean;
  tags?: string[];
}

/**
 * Create a new form template
 */
export async function createFormTemplate(
  templateData: CreateTemplateData,
  userId: string,
  isAdmin: boolean = false
): Promise<string> {
  // Only admins can create official templates, but public templates can be created by anyone
  const isPublic = templateData.isPublic ?? false;
  const isOfficial = isAdmin && templateData.isPublic;
  
  const template: Omit<FormTemplate, 'id'> = {
    name: templateData.name,
    description: templateData.description,
    category: templateData.category,
    icon: templateData.icon,
    color: templateData.color || '#1976d2',
    version: '1.0.0',
    author: userId,
    isPublic,
    isOfficial,
    schema: templateData.schema,
    defaultData: templateData.defaultData || {},
    usageCount: 0,
    tags: templateData.tags || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  const docRef = await addDoc(collection(db, 'formTemplates'), template);
  return docRef.id;
}

/**
 * Update an existing form template
 */
export async function updateFormTemplate(
  templateId: string,
  updates: Partial<CreateTemplateData>,
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  const templateRef = doc(db, 'formTemplates', templateId);
  const templateSnap = await getDoc(templateRef);
  
  if (!templateSnap.exists()) {
    throw new Error('Template not found');
  }
  
  const template = templateSnap.data() as FormTemplate;
  
  // Check permissions
  if (template.author !== userId && !isAdmin) {
    throw new Error('Not authorized to update this template');
  }
  
  // Only admins can make templates public/official
  const updateData: Partial<FormTemplate> = {
    ...updates,
    updatedAt: serverTimestamp(),
  };
  
  if (!isAdmin) {
    // Non-admins cannot change public/official status
    delete updateData.isPublic;
    delete updateData.isOfficial;
  }
  
  await updateDoc(templateRef, updateData);
}

/**
 * Delete a form template
 */
export async function deleteFormTemplate(
  templateId: string,
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  const templateRef = doc(db, 'formTemplates', templateId);
  const templateSnap = await getDoc(templateRef);
  
  if (!templateSnap.exists()) {
    throw new Error('Template not found');
  }
  
  const template = templateSnap.data() as FormTemplate;
  
  // Check permissions
  if (template.author !== userId && !isAdmin) {
    throw new Error('Not authorized to delete this template');
  }
  
  await deleteDoc(templateRef);
}

/**
 * Get all templates accessible to a user
 */
export async function getUserAccessibleTemplates(userId: string): Promise<FormTemplate[]> {
  const templates: FormTemplate[] = [];
  
  // Get public templates
  const publicQuery = query(
    collection(db, 'formTemplates'),
    where('isPublic', '==', true),
    orderBy('usageCount', 'desc'),
    orderBy('createdAt', 'desc')
  );
  
  const publicSnapshot = await getDocs(publicQuery);
  publicSnapshot.forEach(doc => {
    templates.push({ id: doc.id, ...doc.data() } as FormTemplate);
  });
  
  // Get user's private templates
  const privateQuery = query(
    collection(db, 'formTemplates'),
    where('author', '==', userId),
    where('isPublic', '==', false),
    orderBy('createdAt', 'desc')
  );
  
  const privateSnapshot = await getDocs(privateQuery);
  privateSnapshot.forEach(doc => {
    templates.push({ id: doc.id, ...doc.data() } as FormTemplate);
  });
  
  // Get templates shared with the user
  const sharedQuery = query(
    collection(db, 'formTemplates'),
    where('sharedWith', 'array-contains', userId),
    orderBy('createdAt', 'desc')
  );
  
  const sharedSnapshot = await getDocs(sharedQuery);
  sharedSnapshot.forEach(doc => {
    const template = { id: doc.id, ...doc.data() } as FormTemplate;
    // Avoid duplicates (in case user is author and it's also shared with them)
    if (!templates.find(t => t.id === template.id)) {
      templates.push(template);
    }
  });
  
  return templates;
}

/**
 * Get popular/featured public templates
 */
export async function getPopularTemplates(maxResults: number = 20): Promise<FormTemplate[]> {
  const templatesQuery = query(
    collection(db, 'formTemplates'),
    where('isPublic', '==', true),
    orderBy('usageCount', 'desc'),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  
  const snapshot = await getDocs(templatesQuery);
  const templates: FormTemplate[] = [];
  
  snapshot.forEach(doc => {
    templates.push({ id: doc.id, ...doc.data() } as FormTemplate);
  });
  
  return templates;
}

/**
 * Get templates by category
 */
export async function getTemplatesByCategory(
  category: string,
  userId: string,
  includePrivate: boolean = false
): Promise<FormTemplate[]> {
  const templates: FormTemplate[] = [];
  
  // Get public templates in category
  const publicQuery = query(
    collection(db, 'formTemplates'),
    where('isPublic', '==', true),
    where('category', '==', category),
    orderBy('usageCount', 'desc')
  );
  
  const publicSnapshot = await getDocs(publicQuery);
  publicSnapshot.forEach(doc => {
    templates.push({ id: doc.id, ...doc.data() } as FormTemplate);
  });
  
  // Get user's private templates in category if requested
  if (includePrivate) {
    const privateQuery = query(
      collection(db, 'formTemplates'),
      where('author', '==', userId),
      where('isPublic', '==', false),
      where('category', '==', category),
      orderBy('createdAt', 'desc')
    );
    
    const privateSnapshot = await getDocs(privateQuery);
    privateSnapshot.forEach(doc => {
      templates.push({ id: doc.id, ...doc.data() } as FormTemplate);
    });
  }
  
  return templates;
}

/**
 * Search templates by name or description
 */
export async function searchTemplates(
  searchTerm: string,
  userId: string,
  includePrivate: boolean = false
): Promise<FormTemplate[]> {
  // Note: Firestore doesn't support full-text search natively
  // This is a basic implementation that gets all accessible templates and filters them
  const allTemplates = await getUserAccessibleTemplates(userId);
  
  const searchTermLower = searchTerm.toLowerCase();
  return allTemplates.filter(template => 
    template.name.toLowerCase().includes(searchTermLower) ||
    template.description?.toLowerCase().includes(searchTermLower) ||
    template.category?.toLowerCase().includes(searchTermLower) ||
    template.tags?.some(tag => tag.toLowerCase().includes(searchTermLower))
  );
}

/**
 * Get a specific template by ID
 */
export async function getTemplateById(templateId: string): Promise<FormTemplate | null> {
  const templateRef = doc(db, 'formTemplates', templateId);
  const templateSnap = await getDoc(templateRef);
  
  if (!templateSnap.exists()) {
    return null;
  }
  
  return { id: templateSnap.id, ...templateSnap.data() } as FormTemplate;
}

/**
 * Check if user can access a template
 */
export async function canUserAccessTemplate(
  templateId: string,
  userId: string
): Promise<boolean> {
  const template = await getTemplateById(templateId);
  
  if (!template) {
    return false;
  }
  
  // Public templates are accessible to everyone
  if (template.isPublic) {
    return true;
  }
  
  // User owns the template
  if (template.author === userId) {
    return true;
  }
  
  // Template is shared with the user
  if (template.sharedWith?.includes(userId)) {
    return true;
  }
  
  return false;
}

/**
 * Increment usage count for a template
 */
export async function incrementTemplateUsage(templateId: string): Promise<void> {
  const templateRef = doc(db, 'formTemplates', templateId);
  await updateDoc(templateRef, {
    usageCount: (await getDoc(templateRef)).data()?.usageCount + 1 || 1,
    lastUsed: serverTimestamp(),
  });
}

/**
 * Share a private template with other users
 */
export async function shareTemplate(
  templateId: string,
  userIds: string[],
  authorId: string
): Promise<void> {
  const templateRef = doc(db, 'formTemplates', templateId);
  const templateSnap = await getDoc(templateRef);
  
  if (!templateSnap.exists()) {
    throw new Error('Template not found');
  }
  
  const template = templateSnap.data() as FormTemplate;
  
  // Check permissions
  if (template.author !== authorId) {
    throw new Error('Not authorized to share this template');
  }
  
  if (template.isPublic) {
    throw new Error('Cannot share public templates (they are already accessible to everyone)');
  }
  
  const currentSharedWith = template.sharedWith || [];
  const newSharedWith = Array.from(new Set([...currentSharedWith, ...userIds]));
  
  await updateDoc(templateRef, {
    sharedWith: newSharedWith,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Create a form instance from a template
 */
export async function createFormFromTemplate(
  templateId: string,
  formName: string,
  userId: string
): Promise<SecureFormData> {
  const template = await getTemplateById(templateId);
  
  if (!template) {
    throw new Error('Template not found');
  }
  
  if (!(await canUserAccessTemplate(templateId, userId))) {
    throw new Error('Not authorized to access this template');
  }
  
  // Increment usage count
  await incrementTemplateUsage(templateId);
  
  const now = new Date().toISOString();
  
  const formData: SecureFormData = {
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
    template: template, // Embed template information
    schema: JSON.parse(JSON.stringify(template.schema)), // Deep clone
    data: JSON.parse(JSON.stringify(template.defaultData)), // Deep clone
    attachments: {},
    tags: [...(template.tags || [])],
  };
  
  return formData;
}

/**
 * Get all available categories
 */
export async function getTemplateCategories(): Promise<string[]> {
  const templatesQuery = query(collection(db, 'formTemplates'));
  const snapshot = await getDocs(templatesQuery);
  
  const categories = new Set<string>();
  snapshot.forEach(doc => {
    const template = doc.data() as FormTemplate;
    if (template.category) {
      categories.add(template.category);
    }
  });
  
  return Array.from(categories).sort();
}

/**
 * Migrate existing hardcoded templates to database (admin function)
 */
export async function migrateHardcodedTemplates(
  adminUserId: string,
  hardcodedTemplates: { [key: string]: SecureFormData }
): Promise<void> {
  const migratedTemplates: string[] = [];
  
  for (const [key, template] of Object.entries(hardcodedTemplates)) {
    try {
      const templateData: CreateTemplateData = {
        name: template.metadata.name,
        description: template.metadata.description,
        category: template.metadata.category,
        icon: template.metadata.icon,
        color: template.metadata.color,
        schema: template.schema,
        defaultData: template.data,
        isPublic: true, // Make all migrated templates public
        tags: template.tags || [],
      };
      
      const templateId = await createFormTemplate(templateData, adminUserId, true);
      migratedTemplates.push(templateId);
    } catch (error) {
      console.error(`Failed to migrate template ${key}:`, error);
    }
  }
  
}