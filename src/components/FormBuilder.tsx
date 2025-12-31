import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import {
  CreditCard,
  Lock,
  StickyNote2,
  Extension,
  AccountBalance,
  Person,
  Wifi,
  AccountBalanceWallet,
  LocalHospital,
  Gavel,
  VpnKey as License,
  Security,
  DriveEta,
  Star as StarIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { 
  createBlankForm, 
  type SecureFormData,
  type FormTemplate
} from '../utils/formFiles';
import { getAllTemplates, createFormFromTemplate as createEmbeddedForm } from '../utils/embeddedTemplates';

interface FormBuilderProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  privateKey: string;
  parentFolder: string | null;
  onFormCreated: (fileId: string | null, formData?: SecureFormData) => void;
  initialTemplateId?: string; // Optional template to pre-select
}

const TEMPLATE_ICONS = {
  credit_card: CreditCard,
  password: Lock,
  secure_note: StickyNote2,
  bank_account: AccountBalance,
  identity: Person,
  wifi_network: Wifi,
  crypto_wallet: AccountBalanceWallet,
  medical_record: LocalHospital,
  legal_document: Gavel,
  software_license: License,
  insurance_policy: Security,
  vehicle_info: DriveEta,
};

const FormBuilder: React.FC<FormBuilderProps> = ({
  open,
  onClose,
  userId,
  privateKey,
  parentFolder,
  onFormCreated,
  initialTemplateId,
}) => {
  const { t } = useTranslation();
  const [allTemplates, setAllTemplates] = useState<{ [key: string]: FormTemplate }>({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function loadTemplates() {
      try {
        // Wrap i18next's t function to match our TranslateFn signature
        const translateFn = (key: string, fallback?: string) => t(key, fallback || key);
        const templates = await getAllTemplates(userId, translateFn);
        setAllTemplates(templates);
      } catch (error) {
        console.error('Error loading templates:', error);
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, [userId, t]);
  
  const [step, setStep] = useState<'choose' | 'saving'>('choose');
  const [saving, setSaving] = useState(false);
  
  // Template browsing state
  const [currentTab, setCurrentTab] = useState(0); // 0: Built-in, 1: Personal, 2: Categories
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  // If initialTemplateId is provided, auto-select it when templates load
  useEffect(() => {
    if (initialTemplateId && allTemplates[initialTemplateId] && open) {
      const template = allTemplates[initialTemplateId];
      // Auto-select this template
      handleTemplateSelect(template);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId, allTemplates, open]);
  
  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setStep('choose');
      setSaving(false);
      setCurrentTab(0);
      setSelectedCategory('');
    }
  }, [open]);

  // Get all templates as array
  const templatesArray = Object.values(allTemplates);
  
  // Separate built-in and custom templates
  const builtInTemplates = templatesArray.filter(t => t.isOfficial !== false && !t.author);
  const customTemplates = templatesArray.filter(t => t.author === userId || t.isOfficial === false);
  
  // Get categories from built-in templates
  const categories = Array.from(new Set(builtInTemplates.map(t => t.category).filter(Boolean)));
  
  // Filter templates by category if one is selected
  const categoryTemplates = selectedCategory 
    ? builtInTemplates.filter(template => template.category === selectedCategory)
    : [];


  const handleClose = () => {
    if (!saving) {
      setStep('choose');
      setCurrentTab(0);
      setSelectedCategory('');
      onClose();
    }
  };

  const handleTemplateSelect = (template: FormTemplate) => {
    // Start creation process immediately without awaiting
    createFormDirectly(template, template.name).catch(error => {
      console.error('Error in handleTemplateSelect:', error);
      // Reset the saving state if there was an error
      setSaving(false);
      setStep('choose');
    });
  };

  const createFormDirectly = async (template: FormTemplate | null, name: string) => {
    if (!name.trim()) return;

    setSaving(true);
    setStep('saving');

    try {
      let formData: SecureFormData;

      if (template && template.templateId) {
        // Use embedded template system
        // Wrap i18next's t function to match our TranslateFn signature
        const translateFn = (key: string, fallback?: string) => t(key, fallback || key);
        formData = await createEmbeddedForm(template.templateId, name, userId, translateFn);
      } else {
        formData = createBlankForm(name, userId);
      }

      // Don't save to Firestore yet - just pass the form data to be edited
      onFormCreated(null, formData); // Pass null fileId and the form data
      handleClose();
    } catch (error) {
      console.error('Error creating form:', error);
      console.error('Template:', template);
      console.error('Name:', name);
      console.error('UserId:', userId);
      console.error('PrivateKey present:', !!privateKey);
      console.error('ParentFolder:', parentFolder);
      setSaving(false);
      setStep('choose'); // Go back to choose step on error
      throw error; // Re-throw to be caught by caller's catch handler
    }
  };


  // Get icon for template
  const getTemplateIcon = (template: FormTemplate) => {
    if (template.icon) {
      const IconComponent = TEMPLATE_ICONS[template.icon as keyof typeof TEMPLATE_ICONS];
      if (IconComponent) return IconComponent;
    }
    return Extension; // Default icon
  };

  // Render template card
  const renderTemplateCard = (template: FormTemplate) => {
    const IconComponent = getTemplateIcon(template);
    
    return (
      <Card 
        sx={{ 
          cursor: 'pointer',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: (theme) => theme.shadows[4],
            transform: 'translateY(-2px)',
          }
        }} 
        onClick={() => handleTemplateSelect(template)}
      >
        <CardContent sx={{ py: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box 
              sx={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 48,
                height: 48,
                borderRadius: '50%',
                bgcolor: template.color + '20',
                mr: 2.5
              }}
            >
              <IconComponent 
                sx={{ 
                  fontSize: 28, 
                  color: template.color || 'primary.main'
                }} 
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {template.name}
                </Typography>
                {template.isOfficial && (
                  <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {template.description}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip 
                  label={t('forms.fieldsCount', { count: template.schema.fields.length })} 
                  size="small" 
                  variant="outlined"
                  sx={{ fontSize: '0.75rem' }}
                />
                {template.category && (
                  <Chip 
                    label={template.category} 
                    size="small" 
                    sx={{ 
                      fontSize: '0.75rem',
                      bgcolor: template.color + '15',
                      color: template.color,
                      fontWeight: 500
                    }}
                  />
                )}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  const renderChooseStep = () => (
    <>
      <DialogTitle sx={{ 
        textAlign: 'center', 
        pb: 1,
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        {t('forms.createNewForm')}
      </DialogTitle>
      <DialogContent sx={{ px: 3, py: 2, maxHeight: 'calc(90vh - 200px)', overflowY: 'auto' }}>

        {/* Template Tabs */}
        <Tabs 
          value={currentTab} 
          onChange={(_, newValue) => setCurrentTab(newValue)}
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
          centered
        >
          <Tab label={t('forms.builtInTemplates', 'Built-in Templates')} />
          <Tab label={t('forms.personalTemplates', 'Personal Templates')} />
          <Tab label={t('forms.categories', 'Categories')} />
        </Tabs>

        {/* Built-in Templates Tab */}
        {currentTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                {builtInTemplates.length === 0 ? (
                  <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                    {t('forms.noBuiltInTemplates', 'No built-in templates available')}
                  </Typography>
                ) : (
                  builtInTemplates.map((template, index) => (
                    <Box key={`${template.templateId}-${template.name}-${index}`}>
                      {renderTemplateCard(template)}
                    </Box>
                  ))
                )}
              </>
            )}
          </Box>
        )}

        {/* Personal/Custom Templates Tab */}
        {currentTab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                {customTemplates.length === 0 ? (
                  <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                    {t('forms.noPersonalTemplates', 'No personal templates yet. Create your own templates in the Form Templates menu.')}
                  </Typography>
                ) : (
                  customTemplates.map((template, index) => (
                    <Box key={`${template.templateId}-${template.name}-${index}`}>
                      {renderTemplateCard(template)}
                    </Box>
                  ))
                )}
              </>
            )}
          </Box>
        )}

        {/* Categories Tab */}
        {currentTab === 2 && (
              <Box>
                {!selectedCategory ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2 }}>
                    {categories.map(category => (
                      <Card 
                        key={category}
                        sx={{ 
                          cursor: 'pointer',
                          '&:hover': {
                            boxShadow: (theme) => theme.shadows[2],
                          }
                        }}
                        onClick={() => category && setSelectedCategory(category)}
                      >
                        <CardContent sx={{ textAlign: 'center', py: 2 }}>
                          <Typography variant="body1" fontWeight={500}>
                            {category}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                ) : (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Button onClick={() => setSelectedCategory('')} sx={{ mr: 2 }}>
                        ← {t('common.back')}
                      </Button>
                      <Typography variant="h6">{selectedCategory}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {categoryTemplates.length === 0 ? (
                        <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                          {t('forms.noCategoryTemplates', 'No templates in this category')}
                        </Typography>
                      ) : (
                        categoryTemplates.map(renderTemplateCard)
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} size="large">
          {t('common.cancel')}
        </Button>
      </DialogActions>
    </>
  );


  const renderSavingStep = () => (
    <>
      <DialogTitle>{t('forms.creatingForm')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
          <Typography>{t('forms.creatingFormMessage')}</Typography>
        </Box>
      </DialogContent>
    </>
  );

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="lg" 
      fullWidth
      slotProps={{ paper: { sx: { minHeight: 600, maxHeight: '90vh' } } }}
    >
      {step === 'choose' && renderChooseStep()}
      {step === 'saving' && renderSavingStep()}
    </Dialog>
  );
};

export default FormBuilder;