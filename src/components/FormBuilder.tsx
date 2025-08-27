import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Chip
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
  DriveEta
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { 
  createBlankForm, 
  createFormFromTemplate, 
  getCommonFormTemplates,
  saveFormAsFile,
  type SecureFormData 
} from '../utils/formFiles';

interface FormBuilderProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  privateKey: string;
  parentFolder: string | null;
  onFormCreated: () => void;
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
  const [step, setStep] = useState<'choose' | 'customize' | 'saving'>('choose');
  const [formName, setFormName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const templates = getCommonFormTemplates();

  // Debug logging
  console.log('FormBuilder render - open:', open, 'step:', step);

  const handleClose = () => {
    if (!saving) {
      setStep('choose');
      setFormName('');
      setSelectedTemplate(null);
      onClose();
    }
  };

  const handleTemplateSelect = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    setFormName(templates[templateKey].metadata.name);
    setStep('customize');
  };

  const handleCreateBlank = () => {
    setSelectedTemplate(null);
    setFormName(t('forms.newForm'));
    setStep('customize');
  };

  const handleCreateForm = async () => {
    if (!formName.trim()) return;

    setSaving(true);
    setStep('saving');

    try {
      let formData: SecureFormData;

      if (selectedTemplate) {
        formData = createFormFromTemplate(selectedTemplate, formName);
      } else {
        formData = createBlankForm(formName);
      }

      await saveFormAsFile(formData, userId, privateKey, parentFolder);
      onFormCreated();
      handleClose();
    } catch (error) {
      console.error('Error creating form:', error);
      setSaving(false);
      setStep('customize');
    }
  };

  // Order templates by popularity/usefulness (most common first)
  const getOrderedTemplates = () => {
    const popularOrder = [
      'password',        // Most common use case
      'secure_note',     // Very common
      'credit_card',     // Common for personal use
      'identity',        // Important documents
      'bank_account',    // Financial
      'medical_record',  // Has file attachments (our new feature)
      'wifi_network',    // Tech/home use
      'software_license', // Tech use
      'insurance_policy', // Important documents
      'legal_document',  // Important documents
      'crypto_wallet',   // Specialized
      'vehicle_info',    // Specialized
    ];

    return popularOrder
      .map(key => ({ key, template: templates[key] }))
      .filter(item => item.template); // Filter out any missing templates
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

        <Typography variant="h5" sx={{ mb: 3, textAlign: 'center', fontWeight: 500 }}>
          {t('forms.startFromTemplate')}
        </Typography>

        {/* Template List - Single Column for Better Visual Hierarchy */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {getOrderedTemplates().map(({ key, template }) => {
            const IconComponent = TEMPLATE_ICONS[key as keyof typeof TEMPLATE_ICONS] || Extension;
            
            return (
              <Card 
                key={key}
                sx={{ 
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    boxShadow: (theme) => theme.shadows[4],
                    transform: 'translateY(-2px)',
                  }
                }} 
                onClick={() => handleTemplateSelect(key)}
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
                        bgcolor: template.metadata.color + '20',
                        mr: 2.5
                      }}
                    >
                      <IconComponent 
                        sx={{ 
                          fontSize: 28, 
                          color: template.metadata.color || 'primary.main'
                        }} 
                      />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                        {template.metadata.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {template.metadata.description}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip 
                          label={t('forms.fieldsCount', { count: template.schema.fields.length })} 
                          size="small" 
                          variant="outlined"
                          sx={{ fontSize: '0.75rem' }}
                        />
                        {template.metadata.category && (
                          <Chip 
                            label={template.metadata.category} 
                            size="small" 
                            sx={{ 
                              fontSize: '0.75rem',
                              bgcolor: template.metadata.color + '15',
                              color: template.metadata.color,
                              fontWeight: 500
                            }}
                          />
                        )}
                        {key === 'medical_record' && (
                          <Chip 
                            label="File Attachments" 
                            size="small" 
                            color="primary"
                            sx={{ fontSize: '0.75rem' }}
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} size="large">
          {t('common.cancel')}
        </Button>
      </DialogActions>
    </>
  );

  const renderCustomizeStep = () => (
    <>
      <DialogTitle>
        {selectedTemplate ? t('forms.createForm') + ' ' + templates[selectedTemplate].metadata.name : t('forms.createBlankForm')}
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label={t('forms.formTitle')}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          fullWidth
          required
          sx={{ mb: 2, mt: 1 }}
          placeholder={t('forms.enterFormTitle')}
        />

        {selectedTemplate && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('forms.templateIncludes')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {templates[selectedTemplate].schema.fields.map((field) => (
                <Chip
                  key={field.id}
                  label={field.label}
                  size="small"
                  color={field.required ? 'primary' : 'default'}
                  variant={field.sensitive ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          </Paper>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setStep('choose')}>{t('common.back')}</Button>
        <Button
          onClick={handleCreateForm}
          variant="contained"
          disabled={!formName.trim() || saving}
        >
          {t('forms.createForm')}
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
      PaperProps={{ sx: { minHeight: 600, maxHeight: '90vh' } }}
    >
      {step === 'choose' && renderChooseStep()}
      {step === 'customize' && renderCustomizeStep()}
      {step === 'saving' && renderSavingStep()}
    </Dialog>
  );
};

export default FormBuilder;