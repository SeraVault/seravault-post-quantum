import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import type { FormTemplate } from '../utils/formFiles';

export interface CustomTemplate extends Omit<FormTemplate, 'templateId'> {
  id?: string;
  templateId: string;
  userId: string;
  isCustom: true;
  created: Timestamp | Date;
  modified: Timestamp | Date;
}

/**
 * Save a custom template to Firestore
 */
export async function saveCustomTemplate(
  userId: string, 
  template: FormTemplate
): Promise<string> {
  try {
    const templateId = template.templateId || `custom_${Date.now()}_${userId}`;
    const templateRef = doc(db, 'customTemplates', templateId);
    
    const customTemplate: Omit<CustomTemplate, 'id'> = {
      ...template,
      templateId,
      userId,
      isCustom: true,
      created: serverTimestamp(),
      modified: serverTimestamp(),
    };

    await setDoc(templateRef, customTemplate);
    
    return templateId;
  } catch (error) {
    console.error('Error saving custom template:', error);
    throw new Error('Failed to save template');
  }
}

/**
 * Update an existing custom template
 */
export async function updateCustomTemplate(
  userId: string, 
  templateId: string, 
  updates: Partial<FormTemplate>
): Promise<void> {
  try {
    const templateRef = doc(db, 'customTemplates', templateId);
    const templateDoc = await getDoc(templateRef);
    
    if (!templateDoc.exists()) {
      throw new Error('Template not found');
    }
    
    const existingTemplate = templateDoc.data() as CustomTemplate;
    
    // Verify ownership
    if (existingTemplate.userId !== userId) {
      throw new Error('Not authorized to update this template');
    }
    
    const updatedTemplate = {
      ...existingTemplate,
      ...updates,
      modified: serverTimestamp(),
    };
    
    await setDoc(templateRef, updatedTemplate);
  } catch (error) {
    console.error('Error updating custom template:', error);
    throw new Error('Failed to update template');
  }
}

/**
 * Get a specific custom template by ID
 */
export async function getCustomTemplate(templateId: string): Promise<CustomTemplate | null> {
  try {
    const templateRef = doc(db, 'customTemplates', templateId);
    const templateDoc = await getDoc(templateRef);
    
    if (!templateDoc.exists()) {
      return null;
    }
    
    return {
      id: templateDoc.id,
      ...templateDoc.data()
    } as CustomTemplate;
  } catch (error) {
    console.error('Error getting custom template:', error);
    throw new Error('Failed to load template');
  }
}

/**
 * Get all custom templates for a user
 */
export async function getUserCustomTemplates(userId: string): Promise<CustomTemplate[]> {
  try {
    const templatesQuery = query(
      collection(db, 'customTemplates'),
      where('userId', '==', userId),
      orderBy('modified', 'desc')
    );
    
    const snapshot = await getDocs(templatesQuery);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as CustomTemplate[];
  } catch (error: any) {
    console.warn('Custom templates query failed (this is expected if index is still building):', error.message);
    // Return empty array instead of throwing - custom templates are optional
    return [];
  }
}

/**
 * Delete a custom template
 */
export async function deleteCustomTemplate(userId: string, templateId: string): Promise<void> {
  try {
    const templateRef = doc(db, 'customTemplates', templateId);
    const templateDoc = await getDoc(templateRef);
    
    if (!templateDoc.exists()) {
      throw new Error('Template not found');
    }
    
    const template = templateDoc.data() as CustomTemplate;
    
    // Verify ownership
    if (template.userId !== userId) {
      throw new Error('Not authorized to delete this template');
    }
    
    await deleteDoc(templateRef);
  } catch (error) {
    console.error('Error deleting custom template:', error);
    throw new Error('Failed to delete template');
  }
}

/**
 * Get all public custom templates (for sharing)
 */
export async function getPublicCustomTemplates(): Promise<CustomTemplate[]> {
  try {
    const templatesQuery = query(
      collection(db, 'customTemplates'),
      where('isPublic', '==', true),
      orderBy('modified', 'desc')
    );
    
    const snapshot = await getDocs(templatesQuery);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as CustomTemplate[];
  } catch (error: any) {
    console.warn('Public custom templates query failed (this is expected if index is still building):', error.message);
    // Return empty array instead of throwing - custom templates are optional
    return [];
  }
}

/**
 * Convert a CustomTemplate to FormTemplate for use in FormBuilder
 */
export function customTemplateToFormTemplate(customTemplate: CustomTemplate): FormTemplate {
  return {
    templateId: customTemplate.templateId,
    name: customTemplate.name,
    description: customTemplate.description,
    category: customTemplate.category,
    icon: customTemplate.icon,
    color: customTemplate.color,
    version: customTemplate.version,
    isPublic: customTemplate.isPublic,
    isOfficial: false, // Custom templates are never official
    schema: customTemplate.schema,
    defaultData: customTemplate.defaultData,
    tags: customTemplate.tags,
  };
}