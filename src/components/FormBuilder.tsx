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
  Divider,
  IconButton,
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
  Add as AddIcon,
  Public as PublicIcon,
  Lock as PrivateIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { 
  createBlankForm, 
  saveFormAsFile,
  type SecureFormData,
  type FormTemplate
} from '../utils/formFiles';
import { useFormTemplates } from '../context/FormTemplatesContext';

interface FormBuilderProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  privateKey: string;
  parentFolder: string | null;
  onFormCreated: (fileId: string | null, formData?: SecureFormData) => void;
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
}) => {
  const { t } = useTranslation();
  const { 
    userTemplates, 
    popularTemplates, 
    categories, 
    loading: templatesLoading,
    getTemplatesByCategory,
    createFormFromTemplate
  } = useFormTemplates();
  
  const [step, setStep] = useState<'choose' | 'saving'>('choose');
  const [saving, setSaving] = useState(false);
  
  // Template browsing state
  const [currentTab, setCurrentTab] = useState(0); // 0: All Templates, 1: Categories
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setStep('choose');
      setSaving(false);
      setCurrentTab(0);
      setSelectedCategory('');
    }
  }, [open]);

  // Combine all available templates
  const allTemplates = [...userTemplates, ...popularTemplates];
  
  // Filter templates by category if one is selected
  const categoryTemplates = selectedCategory 
    ? allTemplates.filter(template => template.category === selectedCategory)
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

  const handleCreateBlank = () => {
    const blankFormName = t('forms.newForm');
    
    createFormDirectly(null, blankFormName).catch(error => {
      console.error('Error in handleCreateBlank:', error);
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

      if (template && template.id) {
        // Use FormTemplatesContext to create form from database template
        formData = await createFormFromTemplate(template.id, name);
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
        
        {/* Blank Form Option - Prominent */}
        <Card 
          sx={{ 
            mb: 3, 
            cursor: 'pointer',
            border: '2px solid',
            borderColor: 'primary.main',
            '&:hover': {
              boxShadow: (theme) => theme.shadows[8],
              borderColor: 'primary.dark',
            }
          }} 
          onClick={handleCreateBlank}
        >
          <CardContent sx={{ py: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box 
                sx={{ 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  mr: 3
                }}
              >
                <Extension sx={{ fontSize: 32 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
                  {t('forms.blankForm')}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {t('forms.blankFormDescription')}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Typography variant="h5" sx={{ mb: 2, textAlign: 'center', fontWeight: 500 }}>
          {t('forms.startFromTemplate')}
        </Typography>

        {/* Template Tabs */}
        <Tabs 
          value={currentTab} 
          onChange={(_, newValue) => setCurrentTab(newValue)}
          sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
          centered
        >
          <Tab label={t('forms.allTemplates', 'All Templates')} />
          <Tab label={t('forms.categories', 'Categories')} />
        </Tabs>

        {/* All Templates Tab */}
        {currentTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {templatesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                {Object.values(allTemplates).length === 0 ? (
                  <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                    No templates available
                  </Typography>
                ) : (
                  allTemplates.map((template, index) => (
                    <Box key={`${template.id}-${template.name}-${index}`}>
                      {renderTemplateCard(template)}
                      {!template.isOfficial && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 2, display: 'block' }}>
                          Custom Template
                        </Typography>
                      )}
                    </Box>
                  ))
                )}
              </>
            )}
          </Box>
        )}

            {/* Categories Tab */}
            {currentTab === 1 && (
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
                        onClick={() => setSelectedCategory(category)}
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