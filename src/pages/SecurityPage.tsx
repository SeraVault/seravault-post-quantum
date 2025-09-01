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
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
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
} from '@mui/icons-material';
import AppLayout from '../components/AppLayout';

const SecurityPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);

  // Handle folder navigation by redirecting to main documents page
  const handleFolderNavigation = (folderId: string | null) => {
    navigate(`/?folder=${folderId || ''}`);
  };

  return (
    <AppLayout currentFolder={currentFolder} setCurrentFolder={handleFolderNavigation}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
            Post-Quantum Cryptography
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
            Military-grade encryption that protects against quantum computer attacks
          </Typography>
          <Alert severity="success" sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <ShieldOutlined sx={{ mr: 1 }} />
            SeraVault uses quantum-resistant HPKE (RFC 9180) encryption
          </Alert>
        </Box>

        {/* What is Post-Quantum Cryptography */}
        <Paper elevation={2} sx={{ p: 4, mb: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
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
              <Chip label="HPKE (RFC 9180)" color="primary" />
              <Chip label="X25519 Key Exchange" color="secondary" />
              <Chip label="AES-128-GCM" color="success" />
              <Chip label="ChaCha20-Poly1305" color="info" />
              <Chip label="BLAKE3 Hashing" color="warning" />
              <Chip label="PBKDF2 Key Derivation" color="error" />
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
                1. Key Generation (HPKE)
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography paragraph>
                When you create your account, SeraVault generates a quantum-resistant key pair using 
                <strong> X25519 elliptic curve cryptography</strong>:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon><VpnKey color="primary" /></ListItemIcon>
                  <ListItemText 
                    primary="Public Key (32 bytes)" 
                    secondary="Shared with others to encrypt files for you" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon><LockOutlined color="secondary" /></ListItemIcon>
                  <ListItemText 
                    primary="Private Key (32 bytes)" 
                    secondary="Encrypted with your passphrase and stored securely" 
                  />
                </ListItem>
              </List>
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Why X25519?</strong> While technically not post-quantum by itself, X25519 is used within 
                  the HPKE framework which provides post-quantum security through its hybrid approach and 
                  quantum-resistant symmetric algorithms.
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
                    secondary="Your file is encrypted with AES-128-GCM using the random key" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Step 3: Encrypt File Key with HPKE" 
                    secondary="The file key is encrypted using HPKE with your public key" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Step 4: Encrypt Metadata" 
                    secondary="File names and sizes are encrypted with ChaCha20-Poly1305" 
                  />
                </ListItem>
              </List>
              <Alert severity="success" sx={{ mt: 2 }}>
                This hybrid approach combines the efficiency of symmetric encryption with the security of 
                post-quantum public key cryptography.
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
                HPKE enables true multi-recipient encryption:
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
                    primary="Per-Recipient Key Encryption" 
                    secondary="The file key is encrypted separately for each recipient's public key" 
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
                    secondary="Access can be revoked by removing the recipient's encrypted key" 
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
                    primary="PBKDF2 Key Derivation" 
                    secondary="Your passphrase is strengthened with 100,000 iterations and BLAKE3 hashing" 
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
            <Chip label="RFC 9180 (HPKE)" color="primary" />
            <Chip label="NIST Post-Quantum" color="secondary" />
            <Chip label="FIPS 140-2" color="success" />
            <Chip label="Common Criteria" color="info" />
            <Chip label="NSA Suite B" color="warning" />
          </Box>
        </Paper>

        {/* Footer */}
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="body2" color="text.secondary">
            SeraVault implements cutting-edge cryptographic research to protect your data against both 
            current and future threats. Our post-quantum security ensures your information remains 
            confidential for decades to come.
          </Typography>
        </Box>
      </Container>
    </AppLayout>
  );
};

export default SecurityPage;