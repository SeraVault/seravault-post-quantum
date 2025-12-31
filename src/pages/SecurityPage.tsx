import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Container,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Divider,
  Card,
  CardContent,
  Button,
  Snackbar,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ExpandMore,
  Security,
  VpnKey,
  Share,
  CloudUpload,
  Business,
  HealthAndSafety,
  School,
  Gavel,
  ShieldOutlined,
  LockOutlined,
  Key,
  Computer,
  Refresh,
} from '@mui/icons-material';
import { NotificationSettings } from '../components/NotificationSettings';

const SecurityPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [showSuccess, setShowSuccess] = useState(false);

  const handleForceClearCache = async () => {
    try {
      // Unregister all service workers
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }

      // Clear all caches
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      setShowSuccess(true);
      
      // Reload after showing success message
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert('Error clearing cache. Please try manually clearing your browser data.');
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: isMobile ? 2 : 4, px: isMobile ? 1 : 3 }}>
      {/* Header */}
        <Box sx={{ textAlign: 'center', mb: isMobile ? 3 : 6 }}>
          <Typography variant={isMobile ? 'h4' : 'h3'} component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
            Post-Quantum Cryptography
          </Typography>
          <Typography variant={isMobile ? 'body1' : 'h6'} color="text.secondary" sx={{ mb: 3 }}>
            Military-grade encryption that protects against quantum computer attacks
          </Typography>
          <Alert severity="success" sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <ShieldOutlined sx={{ mr: 1 }} />
            SeraVault uses quantum-resistant ML-KEM-768 (NIST FIPS 203) encryption
          </Alert>
        </Box>

        {/* What is Post-Quantum Cryptography */}
        <Paper elevation={2} sx={{ p: isMobile ? 2 : 4, mb: isMobile ? 2 : 4 }}>
          <Typography variant={isMobile ? 'h5' : 'h4'} gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Computer sx={{ mr: 2, color: 'primary.main' }} />
            What is Post-Quantum Cryptography?
          </Typography>
          <Typography variant="body1" paragraph>
            Post-quantum cryptography refers to cryptographic algorithms that are secure against attacks by quantum computers.
            Traditional encryption methods like RSA and ECC will be broken by sufficiently powerful quantum computers using
            algorithms like Shor's algorithm.
          </Typography>
          <Typography variant="body1" paragraph>
            SeraVault implements <strong>quantum-resistant encryption</strong> today, ensuring your data remains secure
            even when quantum computers become powerful enough to break traditional encryption.
          </Typography>
          
          <Box sx={{ mt: 3, p: 3, bgcolor: 'background.default', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>Key Technologies Used:</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip label="ML-KEM-768 (NIST FIPS 203)" color="primary" />
              <Chip label="AES-256-GCM" color="success" />
              <Chip label="ChaCha20-Poly1305" color="info" />
              <Chip label="Argon2id Key Derivation" color="error" />
              <Chip label="WebAuthn/FIDO2" color="secondary" />
            </Box>
          </Box>
        </Paper>

        {/* How It Works */}
        <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Security sx={{ mr: 2, color: 'primary.main' }} />
            How SeraVault's Encryption Works
          </Typography>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                <Key sx={{ mr: 1, verticalAlign: 'middle' }} />
                1. Key Generation (ML-KEM-768)
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                When you create your account, SeraVault generates a quantum-resistant key pair using 
                <strong> ML-KEM-768 (Module-Lattice-Based Key Encapsulation Mechanism)</strong>, 
                standardized by NIST in FIPS 203:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon><VpnKey color="primary" /></ListItemIcon>
                  <ListItemText 
                    primary="Public Key (1,184 bytes)" 
                    secondary="Shared with others to encrypt files for you" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon><LockOutlined color="secondary" /></ListItemIcon>
                  <ListItemText 
                    primary="Private Key (2,400 bytes)" 
                    secondary="Encrypted with your passphrase and stored securely" 
                  />
                </ListItem>
              </List>
              <Alert severity="success" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Why ML-KEM-768?</strong> This is a NIST-standardized post-quantum cryptographic algorithm
                  based on lattice mathematics. It provides security equivalent to AES-192 and is resistant to attacks
                  by both classical and quantum computers. The "768" refers to the security level parameter.
                </Typography>
              </Alert>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                <CloudUpload sx={{ mr: 1, verticalAlign: 'middle' }} />
                2. File Encryption Process
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                When you upload a file, SeraVault uses a multi-layer encryption approach:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Step 1: Generate Random File Key" 
                    secondary="A unique 256-bit AES key is generated for each file" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Step 2: Encrypt File Content" 
                    secondary="Your file is encrypted with AES-256-GCM using the random key" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Step 3: Encapsulate File Key with ML-KEM-768" 
                    secondary="The file key is encapsulated using ML-KEM-768 with your public key" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Step 4: Encrypt Metadata" 
                    secondary="File names and sizes are encrypted with AES-GCM" 
                  />
                </ListItem>
              </List>
              <Alert severity="success" sx={{ mt: 2 }}>
                This hybrid approach combines the efficiency of symmetric encryption with the post-quantum
                security of ML-KEM-768 key encapsulation.
              </Alert>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                <Share sx={{ mr: 1, verticalAlign: 'middle' }} />
                3. Secure File Sharing
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                ML-KEM-768 enables true multi-recipient encryption:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="One File, Multiple Recipients" 
                    secondary="The same encrypted file can be shared with multiple people" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Per-Recipient Key Encapsulation" 
                    secondary="The file key is encapsulated separately for each recipient's ML-KEM-768 public key" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Zero-Knowledge Sharing" 
                    secondary="The server never sees the decrypted file or keys" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Granular Access Control" 
                    secondary="Access can be revoked by removing the recipient's encapsulated key" 
                  />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">
                <HealthAndSafety sx={{ mr: 1, verticalAlign: 'middle' }} />
                4. Passphrase Protection
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                Your private key is protected with quantum-resistant symmetric encryption:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Argon2id Key Derivation" 
                    secondary="Your passphrase is strengthened with memory-hard Argon2id (64 MiB, 3 iterations)" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="ChaCha20-Poly1305 Encryption" 
                    secondary="Military-grade symmetric encryption protects your private key" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Secure Salt Generation" 
                    secondary="Cryptographically random salts prevent rainbow table attacks" 
                  />
                </ListItem>
              </List>
            </AccordionDetails>
          </Accordion>
        </Paper>

        {/* Use Cases */}
        <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Business sx={{ mr: 2, color: 'primary.main' }} />
            What Can You Use This For?
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <Business sx={{ mr: 1, color: 'primary.main' }} />
                  Business & Enterprise
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary="Confidential Documents" secondary="Contracts, financial records, strategic plans" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Customer Data" secondary="Protect sensitive customer information" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Intellectual Property" secondary="Patents, trade secrets, research data" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Compliance Records" secondary="GDPR, HIPAA, SOX documentation" />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <Gavel sx={{ mr: 1, color: 'secondary.main' }} />
                  Legal & Professional
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary="Attorney-Client Communications" secondary="Privileged legal documents and correspondence" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Case Files" secondary="Evidence, depositions, legal research" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Client Records" secondary="Confidential client information and files" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Court Submissions" secondary="Sealed documents and filings" />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <HealthAndSafety sx={{ mr: 1, color: 'success.main' }} />
                  Healthcare
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary="Patient Records" secondary="Medical histories, test results, treatment plans" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Research Data" secondary="Clinical trial data, genomic information" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Insurance Claims" secondary="Protected health information (PHI)" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Telemedicine" secondary="Secure patient-doctor communications" />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <School sx={{ mr: 1, color: 'info.main' }} />
                  Personal & Family
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemText primary="Personal Documents" secondary="Passports, birth certificates, wills" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Financial Records" secondary="Tax returns, bank statements, investments" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Family Photos & Videos" secondary="Irreplaceable memories and media" />
                  </ListItem>
                  <ListItem>
                    <ListItemText primary="Private Communications" secondary="Personal letters, journals, diaries" />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Box>
        </Paper>

        {/* Security Guarantees */}
        <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <ShieldOutlined sx={{ mr: 2, color: 'success.main' }} />
            Security Guarantees
          </Typography>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
            <Alert severity="success" sx={{ height: '100%' }}>
              <Typography variant="h6" gutterBottom>Quantum Resistant</Typography>
              <Typography variant="body2">
                Your data is protected against attacks from quantum computers, including future implementations 
                of Shor's and Grover's algorithms.
              </Typography>
            </Alert>
            
            <Alert severity="info" sx={{ height: '100%' }}>
              <Typography variant="h6" gutterBottom>Zero Knowledge</Typography>
              <Typography variant="body2">
                SeraVault's servers never see your decrypted data, files, or encryption keys. All decryption 
                happens on your device.
              </Typography>
            </Alert>
            
            <Alert severity="warning" sx={{ height: '100%' }}>
              <Typography variant="h6" gutterBottom>Forward Secrecy</Typography>
              <Typography variant="body2">
                Each file uses a unique encryption key. Compromising one file doesn't affect the security 
                of your other files.
              </Typography>
            </Alert>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" gutterBottom>Technical Standards Compliance:</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip label="ML-KEM-768" color="primary" />
            <Chip label="NIST Post-Quantum" color="secondary" />
            <Chip label="FIPS 140-2" color="success" />
            <Chip label="Common Criteria" color="info" />
            <Chip label="NSA Suite B" color="warning" />
          </Box>
        </Paper>

        {/* Notification Settings */}
        <Box sx={{ mb: 4 }}>
          <NotificationSettings />
        </Box>

        {/* Force Update Section */}
        <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Refresh sx={{ mr: 2, color: 'primary.main' }} />
            App Updates & Cache
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            If you're experiencing issues with the app not updating or features not working correctly,
            use this button to force clear all cached data and reload the latest version.
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Warning:</strong> This will sign you out and reload the app. Make sure you have your passphrase saved.
          </Alert>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Refresh />}
            onClick={handleForceClearCache}
            size="large"
          >
            Force Clear Cache & Update
          </Button>
        </Paper>

        <Snackbar
          open={showSuccess}
          autoHideDuration={2000}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert severity="success">
            Cache cleared! Reloading...
          </Alert>
        </Snackbar>

        {/* Footer */}
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="body2" color="text.secondary">
            SeraVault implements cutting-edge cryptographic research to protect your data against both 
            current and future threats. Our post-quantum security ensures your information remains 
            confidential for decades to come.
          </Typography>
        </Box>
      </Container>
  );
};

export default SecurityPage;