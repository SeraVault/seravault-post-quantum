import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  getUserAccessibleTemplates,
  getPopularTemplates,
  getTemplatesByCategory,
  getTemplateCategories,
  createFormTemplate,
  updateFormTemplate,
  deleteFormTemplate,
  shareTemplate,
  createFormFromTemplate as createFormFromTemplateService,
  type CreateTemplateData,
  type FormTemplate,
} from '../services/formTemplates';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { SecureFormData } from '../utils/formFiles';

interface FormTemplatesContextType {
  // Templates data
  userTemplates: FormTemplate[];
  popularTemplates: FormTemplate[];
  categories: string[];
  
  // Loading states
  loading: boolean;
  categoriesLoading: boolean;
  
  // Actions
  refreshTemplates: () => Promise<void>;
  refreshPopularTemplates: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  getTemplatesByCategory: (category: string) => Promise<FormTemplate[]>;
  
  // Template management
  createTemplate: (templateData: CreateTemplateData) => Promise<string>;
  updateTemplate: (templateId: string, updates: Partial<CreateTemplateData>) => Promise<void>;
  deleteTemplate: (templateId: string) => Promise<void>;
  shareTemplate: (templateId: string, userIds: string[]) => Promise<void>;
  
  // Form creation
  createFormFromTemplate: (templateId: string, formName: string) => Promise<SecureFormData>;
  
  // User permissions
  isAdmin: boolean;
}

const FormTemplatesContext = createContext<FormTemplatesContextType | undefined>(undefined);

export const useFormTemplates = () => {
  const context = useContext(FormTemplatesContext);
  if (!context) {
    throw new Error('useFormTemplates must be used within a FormTemplatesProvider');
  }
  return context;
};

export const FormTemplatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  // State
  const [userTemplates, setUserTemplates] = useState<FormTemplate[]>([]);
  const [popularTemplates, setPopularTemplates] = useState<FormTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  
  // Check if user is admin (you'll need to implement admin claim logic)
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Check admin status when user changes
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      
      try {
        // Get custom claims to check admin status
        const idTokenResult = await user.getIdTokenResult();
        const userIsAdmin = !!idTokenResult.claims.admin;
        setIsAdmin(userIsAdmin);
        
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };
    
    checkAdminStatus();
  }, [user]);
  
  // Real-time listener for user templates
  useEffect(() => {
    if (!user) {
      setUserTemplates([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Set up listeners for public templates (no orderBy to avoid composite index)
    const publicQuery = query(
      collection(db, 'formTemplates'),
      where('isPublic', '==', true)
    );

    // Set up listeners for private templates (no orderBy to avoid composite index)
    const privateQuery = query(
      collection(db, 'formTemplates'),
      where('author', '==', user.uid)
    );

    // Set up listeners for shared templates (temporarily disabled due to missing index)
    // const sharedQuery = query(
    //   collection(db, 'formTemplates'),
    //   where('sharedWith', 'array-contains', user.uid),
    //   orderBy('createdAt', 'desc')
    // );

    const templates = new Map<string, FormTemplate>();
    let completedQueries = 0;
    const totalQueries = 2; // Reduced from 3 since shared query is disabled

    const checkCompletion = () => {
      completedQueries++;
      if (completedQueries === totalQueries) {
        const finalTemplates = Array.from(templates.values());
        setUserTemplates(finalTemplates);
        setLoading(false);
      }
    };

    const unsubscribe1 = onSnapshot(publicQuery, 
      (snapshot) => {
        snapshot.forEach(doc => {
          templates.set(doc.id, { id: doc.id, ...doc.data() } as FormTemplate);
        });
        checkCompletion();
      },
      (error) => {
        console.warn('❌ Public templates query failed:', error.message);
        checkCompletion();
      }
    );

    const unsubscribe2 = onSnapshot(privateQuery,
      (snapshot) => {
        snapshot.forEach(doc => {
          const template = { id: doc.id, ...doc.data() } as FormTemplate;
          // Only include this user's private templates or templates they authored
          if (template.author === user.uid) {
            templates.set(doc.id, template);
          }
        });
        checkCompletion();
      },
      (error) => {
        console.warn('❌ Private templates query failed:', error.message);
        checkCompletion();
      }
    );

    // Temporarily disabled shared templates query
    // const unsubscribe3 = onSnapshot(sharedQuery,
    //   (snapshot) => {
    //     snapshot.forEach(doc => {
    //       const template = { id: doc.id, ...doc.data() } as FormTemplate;
    //       // Avoid duplicates (in case user is author and it's also shared with them)
    //       if (!templates.has(doc.id)) {
    //         templates.set(doc.id, template);
    //       }
    //     });
    //     checkCompletion();
    //   },
    //   (error) => {
    //     console.warn('❌ Shared templates query failed:', error.message);
    //     checkCompletion();
    //   }
    // );

    return () => {
      unsubscribe1();
      unsubscribe2();
      // unsubscribe3(); // Disabled
    };
  }, [user]);

  // Real-time listener for popular templates
  useEffect(() => {
    
    const popularQuery = query(
      collection(db, 'formTemplates'),
      where('isPublic', '==', true),
      limit(20)
    );

    const unsubscribe = onSnapshot(popularQuery,
      (snapshot) => {
        const templates: FormTemplate[] = [];
        snapshot.forEach(doc => {
          templates.push({ id: doc.id, ...doc.data() } as FormTemplate);
        });
        setPopularTemplates(templates);
      },
      (error) => {
        console.warn('❌ Popular templates query failed:', error.message);
        setPopularTemplates([]);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Legacy refresh functions for backward compatibility
  const refreshTemplates = async () => {
  };
  
  const refreshPopularTemplates = async () => {
  };
  
  // Load categories (extract from loaded templates instead of separate query)
  const refreshCategories = async () => {
    setCategoriesLoading(true);
    try {
      // Extract categories from already loaded templates
      const allTemplates = [...userTemplates, ...popularTemplates];
      const categorySet = new Set<string>();
      
      allTemplates.forEach(template => {
        if (template.category) {
          categorySet.add(template.category);
        }
      });
      
      const cats = Array.from(categorySet).sort();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  };
  
  // Get templates by category
  const getTemplatesByCategoryWrapper = async (category: string): Promise<FormTemplate[]> => {
    if (!user) return [];
    
    try {
      return await getTemplatesByCategory(category, user.uid, true);
    } catch (error) {
      console.error('Error loading templates by category:', error);
      return [];
    }
  };
  
  // Create template
  const createTemplate = async (templateData: CreateTemplateData): Promise<string> => {
    if (!user) throw new Error('User not authenticated');
    
    const templateId = await createFormTemplate(templateData, user.uid, isAdmin);
    // Real-time listeners will automatically update the UI
    return templateId;
  };
  
  // Update template
  const updateTemplate = async (templateId: string, updates: Partial<CreateTemplateData>): Promise<void> => {
    if (!user) throw new Error('User not authenticated');
    
    await updateFormTemplate(templateId, updates, user.uid, isAdmin);
    // Real-time listeners will automatically update the UI
  };
  
  // Delete template
  const deleteTemplate = async (templateId: string): Promise<void> => {
    if (!user) throw new Error('User not authenticated');
    
    await deleteFormTemplate(templateId, user.uid, isAdmin);
    // Real-time listeners will automatically update the UI
  };
  
  // Share template
  const shareTemplateWrapper = async (templateId: string, userIds: string[]): Promise<void> => {
    if (!user) throw new Error('User not authenticated');
    
    await shareTemplate(templateId, userIds, user.uid);
  };
  
  // Create form from template
  const createFormFromTemplate = async (templateId: string, formName: string): Promise<SecureFormData> => {
    if (!user) throw new Error('User not authenticated');
    
    // Find the template in our already-loaded templates instead of fetching it again
    const template = [...userTemplates, ...popularTemplates].find(t => t.id === templateId);
    
    if (!template) {
      throw new Error('Template not found');
    }
    
    // Check if user can access this template
    const canAccess = template.isPublic || template.author === user.uid || 
                      (template.sharedWith && template.sharedWith.includes(user.uid));
    
    if (!canAccess) {
      throw new Error('Not authorized to access this template');
    }
    
    // Create form data directly instead of using the service
    const now = new Date().toISOString();
    
    const formData: SecureFormData = {
      metadata: {
        name: formName,
        description: `Created from template: ${template.name}`,
        category: template.category,
        icon: template.icon,
        color: template.color,
        version: '1.0.0',
        author: user.uid,
        created: now,
        modified: now,
      },
      schema: template.schema,
      data: { ...template.defaultData },
      tags: [],
    };
    
    return formData;
  };
  
  // Auto-refresh categories when templates change
  useEffect(() => {
    if (user && (userTemplates.length > 0 || popularTemplates.length > 0)) {
      refreshCategories();
    } else if (!user) {
      setCategories([]);
      setCategoriesLoading(false);
    }
  }, [user, userTemplates, popularTemplates]);
  
  const value: FormTemplatesContextType = {
    // Data
    userTemplates,
    popularTemplates,
    categories,
    
    // Loading states
    loading,
    categoriesLoading,
    
    // Actions
    refreshTemplates,
    refreshPopularTemplates,
    refreshCategories,
    getTemplatesByCategory: getTemplatesByCategoryWrapper,
    
    // Template management
    createTemplate,
    updateTemplate,
    deleteTemplate,
    shareTemplate: shareTemplateWrapper,
    
    // Form creation
    createFormFromTemplate,
    
    // User permissions
    isAdmin,
  };
  
  return (
    <FormTemplatesContext.Provider value={value}>
      {children}
    </FormTemplatesContext.Provider>
  );
};