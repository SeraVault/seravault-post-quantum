import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Link,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const HelpPage: React.FC = () => {
  const { i18n } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [helpContent, setHelpContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Custom components for ReactMarkdown to handle links and headings properly
  const components: Components = {
    a: ({ href, children }) => {
      // Handle anchor links (internal page navigation)
      if (href?.startsWith('#')) {
        return (
          <Link
            href={href}
            onClick={(e) => {
              e.preventDefault();
              const targetId = href.substring(1);
              const element = document.getElementById(targetId);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            sx={{
              color: 'primary.main',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {children}
          </Link>
        );
      }
      // Handle external links
      return (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            color: 'primary.main',
            '&:hover': {
              textDecoration: 'underline',
            },
          }}
        >
          {children}
        </Link>
      );
    },
    h1: ({ children }) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return <h1 id={id}>{children}</h1>;
    },
    h2: ({ children }) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return <h2 id={id}>{children}</h2>;
    },
    h3: ({ children }) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return <h3 id={id}>{children}</h3>;
    },
  };

  useEffect(() => {
    const loadHelpContent = async () => {
      setLoading(true);
      try {
        // Try to load language-specific help file
        const language = i18n.language || 'en';
        let content: string | null = null;
        
        // Try language-specific file first
        try {
          const response = await fetch(`/content/help.${language}.md`);
          if (response.ok) {
            content = await response.text();
          }
        } catch (error) {
          console.log(`Help file for language ${language} not found, trying fallback`);
        }
        
        // If language-specific file not found, try English fallback
        if (!content) {
          try {
            const fallbackResponse = await fetch('/content/help.en.md');
            if (fallbackResponse.ok) {
              content = await fallbackResponse.text();
            }
          } catch (error) {
            console.log('English fallback help file not found, using inline content');
          }
        }
        
        // If all file fetches fail, use inline default content
        setHelpContent(content || getDefaultHelpContent());
      } catch (error) {
        console.error('Error loading help content:', error);
        setHelpContent(getDefaultHelpContent());
      } finally {
        setLoading(false);
      }
    };

    loadHelpContent();
  }, [i18n.language]);

  const getDefaultHelpContent = () => {
    return `# Help Guide

## Creating Content

### Upload Files
1. Click the **+** button in the bottom-right corner
2. Select **Upload File**
3. Choose your file(s) from your device
4. Files are automatically encrypted before upload

### Create a Form
1. Click the **+** button
2. Select **Create Form**
3. Design your form with various field types
4. Save the form template for reuse

### Start a Chat
1. Click the **+** button
2. Select **New Chat**
3. Choose contacts to chat with
4. Send encrypted messages and files

## Managing Contacts

### Understanding Contact Tabs

The Contacts page has several tabs to help you manage your connections:

#### Contacts Tab
- Shows all your established connections
- People you can share files and chat with
- Your active network

#### Requests Tab (Inbox)
- **Incoming contact requests** from existing SeraVault users
- **Incoming invitations** from users who invited you before you signed up
- Accept or ignore requests from others wanting to connect
- Badge shows total pending requests

#### Sent Tab
- **Outgoing contact requests** you sent to existing users
- Shows pending requests waiting for acceptance
- Track who you've reached out to

#### Invitations Tab
- **Email invitations** you sent to people without SeraVault accounts
- Once they sign up, they'll be automatically connected to you
- Perfect for bringing new users to SeraVault

### Adding Contacts

**To connect with an existing user:**
1. Go to Contacts page
2. Click **Add Contact** button
3. Enter their email address
4. Add an optional message
5. They'll receive it in their **Requests** tab

**To invite someone new:**
1. Click **Add Contact**
2. Enter an email of someone without an account
3. An invitation will be sent to their email
4. When they sign up using that email, you'll be automatically connected

### Create Folders
1. Click the **+** button
2. Select **New Folder**
3. Name your folder
4. Organize your files by dragging them into folders

## Sharing Content

### Share Files
1. Right-click on a file (or click the menu icon)
2. Select **Share**
3. Choose contacts to share with
4. Recipients receive an encrypted copy

### Share Folders
1. Right-click on a folder
2. Select **Share**
3. All files in the folder are shared with selected contacts

### Share Forms
1. Open a form
2. Click the **Share** button
3. Recipients can fill out the form

### Chat File Attachments
1. Open a chat conversation
2. Click the attachment icon
3. Select a file to share
4. File is encrypted and sent to all participants

## Managing Content

### Organize with Folders
- Drag and drop files into folders
- Files can be in different folders for different users
- Your folder organization is personal to you

### Favorites
- Click the star icon to favorite files
- Access favorites from the sidebar
- Favorites are private to you

### Tags
- Add tags to files for better organization
- Filter files by tags
- Tags are encrypted and private

### Rename Files
- Right-click a file
- Select **Rename**
- Choose a personal name (only you see it)

## Security Features

### End-to-End Encryption
- All files are encrypted before leaving your device
- Only you and people you share with can decrypt files
- Even we cannot access your encrypted data

### Post-Quantum Security
- Uses CRYSTALS-Kyber for key encapsulation
- Resistant to quantum computer attacks
- Future-proof encryption

### Private Keys
- Your private key never leaves your device unencrypted
- Protect your passphrase carefully
- Enable biometric authentication for convenience

## Key Management & Profile Settings

### Authentication Methods
Visit your **Profile** page to manage different ways to unlock your vault:

#### Passphrase Protection
- Your primary method for unlocking your vault
- Used to encrypt your private key
- Change your passphrase anytime from Profile
- Choose a strong, memorable passphrase

#### Biometric Authentication
- Use fingerprint or Face ID for quick access
- Available on supported devices
- Set up from Profile page
- Biometric data never leaves your device

#### Hardware Security Keys
- Use YubiKey or other FIDO2 devices
- Most secure authentication method
- Register keys from Profile page
- Can register multiple keys as backup

### Key Management Actions

#### Generate New Keys
- Create your encryption keys on first use
- Post-quantum secure (ML-KEM-768)
- Keep your passphrase safe - it cannot be recovered

#### Export Private Key
- Download your private key as backup
- Store in a secure location (offline recommended)
- Needed to recover access if you lose your passphrase
- Access from Profile > Key Management section

#### Import Private Key
- Restore access using a previously exported key
- Upload your key file from Profile page
- Enter your passphrase to decrypt the key
- Use this if you need to recover your account

### Security Best Practices
- **Never share your private key** with anyone
- **Keep your passphrase secure** - write it down offline
- **Export your key** and store the backup safely
- **Enable biometric auth** for convenience without sacrificing security
- **Use hardware keys** for maximum security
- **Register multiple hardware keys** to avoid lockout

### Profile Settings
Access additional settings from your Profile page:

- **Display Name**: Update how you appear to others
- **Theme**: Switch between light and dark mode
- **JSON Import**: Import data from other password managers
- **Account Deletion**: Permanently delete your account and all data

## Tips & Tricks

- Use the search bar to quickly find files
- Recent files are accessible from the sidebar
- Shared files appear in "Shared with me"
- Export your private key as backup (keep it safe!)
- Press Enter in the folder dialog to quickly create folders
- Import progress continues even if you navigate away
`;
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper sx={{ p: { xs: 2, md: 4 } }}>
          {loading ? (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              Loading help content...
            </Box>
          ) : (
            <Box
              sx={{
                '& h1': {
                  fontSize: '2rem',
                  fontWeight: 600,
                  mb: 2,
                  mt: 3,
                  color: 'primary.main',
                  '&:first-of-type': { mt: 0 },
                },
                '& h2': {
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  mb: 1.5,
                  mt: 3,
                  color: 'text.primary',
                  borderBottom: 1,
                  borderColor: 'divider',
                  pb: 0.5,
                },
                '& h3': {
                  fontSize: '1.25rem',
                  fontWeight: 500,
                  mb: 1,
                  mt: 2,
                  color: 'text.primary',
                },
                '& p': {
                  mb: 1.5,
                  lineHeight: 1.7,
                },
                '& ul, & ol': {
                  mb: 2,
                  pl: 3,
                },
                '& li': {
                  mb: 0.5,
                  lineHeight: 1.6,
                },
                '& code': {
                  backgroundColor: 'action.hover',
                  padding: '2px 6px',
                  borderRadius: 1,
                  fontSize: '0.9em',
                  fontFamily: 'monospace',
                },
                '& strong': {
                  fontWeight: 600,
                  color: 'text.primary',
                },
                '& a': {
                  color: 'primary.main',
                  cursor: 'pointer',
                },
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {helpContent}
              </ReactMarkdown>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  );
};

export default HelpPage;
