import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  FormControlLabel,
  Box,
  Typography,
  Tabs,
  Tab,
  Link,
  Alert,
} from '@mui/material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`terms-tabpanel-${index}`}
      aria-labelledby={`terms-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

interface TermsAcceptanceDialogProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const TermsAcceptanceDialog: React.FC<TermsAcceptanceDialogProps> = ({ open, onAccept, onDecline }) => {
  const [tabValue, setTabValue] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleAccept = () => {
    if (termsAccepted && privacyAccepted) {
      onAccept();
    }
  };

  const canAccept = termsAccepted && privacyAccepted;

  return (
    <Dialog 
      open={open} 
      maxWidth="md" 
      fullWidth
      disableEscapeKeyDown
    >
      <DialogTitle>
        <Typography variant="h5" component="div">
          Terms & Privacy Agreement
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Please review and accept our Terms of Service and Privacy Policy to continue
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="terms and privacy tabs">
            <Tab label="Terms of Service" id="terms-tab-0" />
            <Tab label="Privacy Policy" id="terms-tab-1" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Box sx={{ maxHeight: '400px', overflow: 'auto', pr: 2 }}>
            <Typography variant="h6" gutterBottom>
              SeraVault Terms of Service
            </Typography>
            
            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              1. Acceptance of Terms
            </Typography>
            <Typography variant="body2" paragraph>
              By creating an account, you agree to be bound by these Terms of Service and all applicable laws and regulations.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              2. Zero-Knowledge Architecture
            </Typography>
            <Typography variant="body2" paragraph>
              SeraVault operates on a zero-knowledge architecture. We cannot access, decrypt, or recover your encrypted data. 
              You are solely responsible for maintaining your passphrase and encryption keys. Loss of your passphrase or keys 
              will result in permanent loss of access to your data.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              3. User Responsibilities
            </Typography>
            <Typography variant="body2" paragraph>
              You agree to: (a) maintain the confidentiality of your passphrase, (b) use the service only for lawful purposes, 
              (c) not attempt to bypass security measures, and (d) maintain backup copies of critical encryption keys.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              4. Acceptable Use
            </Typography>
            <Typography variant="body2" paragraph>
              You may not use SeraVault to store, transmit, or share illegal content, malware, or content that violates 
              intellectual property rights. We reserve the right to suspend accounts in violation of these terms.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              5. Limitation of Liability
            </Typography>
            <Typography variant="body2" paragraph>
              SeraVault is provided "as is" without warranties. Our total liability shall not exceed $100 USD. 
              We are not liable for data loss, service interruptions, or damages resulting from use of the service.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              6. Data Backup
            </Typography>
            <Typography variant="body2" paragraph>
              While we maintain redundant infrastructure, you are responsible for maintaining independent backups of 
              critical data and encryption keys. We are not responsible for data loss.
            </Typography>

            <Typography variant="body2" sx={{ mt: 3, fontStyle: 'italic' }}>
              <Link href="/terms-of-service.html" target="_blank" rel="noopener">
                View full Terms of Service
              </Link>
            </Typography>
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2">
                I have read and agree to the <strong>Terms of Service</strong>
              </Typography>
            }
            sx={{ mt: 2 }}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ maxHeight: '400px', overflow: 'auto', pr: 2 }}>
            <Typography variant="h6" gutterBottom>
              SeraVault Privacy Policy
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              1. Information We Collect
            </Typography>
            <Typography variant="body2" paragraph>
              We collect minimal information: email address, authentication data, and encrypted file metadata. 
              We cannot access the contents of your encrypted files, messages, or forms.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              2. Zero-Knowledge Encryption
            </Typography>
            <Typography variant="body2" paragraph>
              All file contents, messages, and form data are encrypted client-side using your passphrase-derived keys. 
              We store only encrypted data and cannot decrypt it. Your passphrase never leaves your device.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              3. Data Storage
            </Typography>
            <Typography variant="body2" paragraph>
              Encrypted data is stored on secure cloud infrastructure with industry-standard security measures. 
              Metadata (file names, timestamps, sizes) may be visible to us but content remains encrypted.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              4. Third-Party Services
            </Typography>
            <Typography variant="body2" paragraph>
              We use Firebase for authentication and storage. Google's privacy policy applies to their services. 
              We do not sell or share your data with third parties for marketing purposes.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              5. Your Rights (GDPR/CCPA)
            </Typography>
            <Typography variant="body2" paragraph>
              You have the right to: access your data, request deletion, export your data, and withdraw consent. 
              Contact us to exercise these rights. Note that deleting encryption keys will make data unrecoverable.
            </Typography>

            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 'bold' }}>
              6. Data Retention
            </Typography>
            <Typography variant="body2" paragraph>
              Your data is retained as long as your account is active. Upon account deletion, we remove all data 
              within 30 days, except where required by law.
            </Typography>

            <Typography variant="body2" sx={{ mt: 3, fontStyle: 'italic' }}>
              <Link href="/privacy-policy.html" target="_blank" rel="noopener">
                View full Privacy Policy
              </Link>
            </Typography>
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2">
                I have read and agree to the <strong>Privacy Policy</strong>
              </Typography>
            }
            sx={{ mt: 2 }}
          />
        </TabPanel>

        {!canAccept && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Please review and accept both the Terms of Service and Privacy Policy to continue
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onDecline} color="inherit">
          Decline
        </Button>
        <Button 
          onClick={handleAccept} 
          variant="contained" 
          disabled={!canAccept}
          color="primary"
        >
          Accept & Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TermsAcceptanceDialog;
