# Help Guide

## Table of Contents

- [Creating Content](#creating-content)
  - [Upload Files](#upload-files)
  - [Create a Form](#create-a-form)
  - [Start a Chat](#start-a-chat)
  - [Create Folders](#create-folders)
- [Contacts & Invitations](#contacts--invitations)
  - [Adding Contacts](#adding-contacts)
  - [Accepting Contact Requests](#accepting-contact-requests)
  - [Managing Contacts](#managing-contacts)
  - [Sharing with Contacts](#sharing-with-contacts)
- [Sharing Content](#sharing-content)
  - [Share Files](#share-files)
  - [Share Folders](#share-folders)
  - [Share Forms](#share-forms)
  - [Chat File Attachments](#chat-file-attachments)
- [Managing Content](#managing-content)
  - [Organize with Folders](#organize-with-folders)
  - [Favorites](#favorites)
  - [Tags](#tags)
  - [Rename Files](#rename-files)
- [Security Features](#security-features)
  - [End-to-End Encryption](#end-to-end-encryption)
  - [Post-Quantum Security](#post-quantum-security)
  - [Private Keys](#private-keys)
- [Key Management & Profile Settings](#key-management--profile-settings)
  - [Authentication Methods](#authentication-methods)
  - [Key Management Actions](#key-management-actions)
  - [Security Best Practices](#security-best-practices)
  - [Profile Settings](#profile-settings)
- [Tips & Tricks](#tips--tricks)

## Creating Content

### Upload Files
1. Click the **+** (FAB) button in the bottom-right corner
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

### Create Folders
1. Click the **+** button
2. Select **New Folder**
3. Name your folder
4. Organize your files by dragging them into folders

## Contacts & Invitations

### Adding Contacts

#### If the person already has an account:
1. Click **Contacts** in the sidebar
2. Click the **Add Contact** button
3. Enter their email address
4. Add an optional personal message
5. Click **Send Request**

**What happens next:**
- The recipient receives a notification (if enabled)
- The request appears in their "Requests" tab
- Request expires after 30 days if not responded to
- Once accepted, you both become contacts and can share files

#### If the person doesn't have an account yet:
1. Follow the same steps to add a contact
2. Enter their email address
3. Your email client will open with an invitation email
4. Send the pre-filled invitation email

**What happens next:**
- They receive an email with a signup link
- The link includes your invitation code
- When they sign up, you're automatically connected
- Invitation expires after 30 days

### Accepting Contact Requests
1. Click **Contacts** in the sidebar
2. Go to the **Requests** tab
3. You'll see pending requests with sender's name and email
4. Click the ✓ (checkmark) to accept
5. Click the ✗ to decline

### Managing Contacts
- View all contacts in the **Contacts** tab
- Search contacts by name or email
- Remove contacts by clicking the menu icon
- Block users if needed

### Sharing with Contacts
- Only contacts can see your shared files
- Select contacts when sharing files or folders
- Chat participants are automatically contacts
- Contact relationship is mutual (both users are connected)

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
- Uses ML-KEM-768 (formerly CRYSTALS-Kyber) for key encapsulation
- Resistant to quantum computer attacks
- Future-proof encryption
- Standardized by NIST for post-quantum cryptography

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
- Option to store private key directly in hardware (no passphrase needed)
- Can switch between passphrase-only and hardware-key authentication modes

##### Hardware Key Authentication Modes

**Passphrase + Hardware Key (Hybrid)**
- Your private key is encrypted with your passphrase AND stored in hardware
- Can unlock using either your passphrase OR hardware key
- Provides redundancy and flexibility
- Recommended for most users

**Hardware Key Only**
- Private key stored only in hardware keys (no passphrase backup)
- Maximum security - no encrypted key on server
- Must have access to hardware key to unlock
- **Important**: Register multiple hardware keys as backup to avoid lockout

**Switching Between Modes**
- Remove passphrase protection: After storing key in hardware, you can remove the passphrase-encrypted backup
- Restore passphrase protection: If using hardware-only mode, you can add passphrase encryption back
- Both operations available in Profile > Hardware Security Keys section
- Allows you to choose security vs. convenience balance

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
- **Consider hybrid mode** (passphrase + hardware key) for best balance of security and convenience
- **Hardware-only mode** provides maximum security but requires careful backup key management

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
