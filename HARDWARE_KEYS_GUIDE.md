# Hardware Security Keys Guide

## What are Hardware Security Keys?

Hardware security keys (also called FIDO2 or WebAuthn keys) are physical devices that provide **phishing-resistant two-factor authentication**. Popular examples include:

- **YubiKey** (by Yubico)
- **Google Titan Security Key**
- **Feitian ePass**
- **Thetis FIDO2**
- **SoloKeys**

## How It Works in SeraVault

### Security Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Login     │────▶│  Hardware    │────▶│  Firebase   │────▶│  Passphrase  │
│ Email/OAuth │     │  Key Touch   │     │    Auth     │     │  Decrypts    │
└─────────────┘     └──────────────┘     └─────────────┘     │ Private Key  │
                                                              └──────────────┘
```

### Two-Layer Security

1. **Authentication Layer**: Hardware key proves you're the account owner
2. **Encryption Layer**: Passphrase decrypts your post-quantum encrypted files

This means **even if someone steals your password**, they still need:
- Your physical hardware key (something you have)
- Your passphrase (something you know)

## Setup Instructions

### 1. Register Your Hardware Key

1. Navigate to **Profile → Security Settings**
2. Scroll to **Hardware Security Keys** section
3. Click **"Register Security Key"**
4. Enter a nickname (optional) - e.g., "YubiKey 5C", "Backup Titan Key"
5. Click **"Register Key"**
6. **Insert your key** (USB, NFC, or Bluetooth)
7. **Touch the button** on your key when prompted
8. Key is now registered! ✅

### 2. Using Your Hardware Key

#### On Login:
1. Enter your email/password (or use OAuth)
2. Browser will prompt: "Insert and touch your security key"
3. Insert your key and touch it
4. Enter your passphrase to decrypt your files
5. You're in! 🎉

#### Browser Support:
- ✅ Chrome/Edge (v67+)
- ✅ Firefox (v60+)
- ✅ Safari (v13+)
- ✅ Opera (v54+)

## Supported Key Types

### USB Keys (Most Common)
- Insert into USB-A or USB-C port
- Touch the button when prompted
- Works on all computers

### NFC Keys
- Tap key against phone/tablet
- Works on mobile devices with NFC
- Also works via USB on computers

### Bluetooth Keys
- Pair with your device
- Touch button to authenticate
- Works wirelessly

## Best Practices

### ✅ DO:
- **Register 2+ keys**: Keep a backup key in a safe place
- **Name your keys**: Use descriptive nicknames like "Work YubiKey", "Backup Key"
- **Test your backup**: Make sure your backup key works
- **Keep keys accessible**: Attach to keychain or keep in wallet

### ❌ DON'T:
- **Share your key**: Each person should have their own
- **Register same key on multiple accounts**: Use different keys for different services
- **Forget your backup**: Always have a second key stored safely

## Recommended Keys

### For Most Users: YubiKey 5 Series
- **YubiKey 5 NFC** ($50): USB-A + NFC, works everywhere
- **YubiKey 5C NFC** ($55): USB-C + NFC, for newer laptops
- Supports FIDO2, U2F, OTP, and smart card

### Budget Option: Feitian ePass
- **Feitian ePass K9** ($20-30): USB-A, FIDO2/U2F
- Good basic security at lower cost

### For Maximum Security: YubiKey Bio
- **YubiKey Bio** ($85): Built-in fingerprint scanner
- No need to touch, just place finger

## Troubleshooting

### Key Not Recognized

**Problem**: Browser doesn't detect your key

**Solutions**:
1. Try a different USB port
2. Update your browser
3. Check if key works on another device
4. For NFC, ensure NFC is enabled on your phone

### Key Already Registered

**Problem**: "This security key is already registered"

**Solution**:
- You've already registered this key
- Use a different physical key
- Or remove the existing registration first

### Touch Not Working

**Problem**: Touch doesn't trigger authentication

**Solutions**:
1. Touch the gold contact area (not the plastic)
2. Hold for 1-2 seconds
3. Try touching again
4. Check if key LED is blinking

### Browser Not Supported

**Problem**: "Hardware keys not supported"

**Solutions**:
1. Update your browser to the latest version
2. Try Chrome/Edge (best support)
3. Enable WebAuthn in browser settings

## Security Considerations

### What Happens If:

#### You Lose Your Key?
- ✅ Use your backup key to log in
- ✅ Register a new key
- ✅ Remove the lost key from your account
- ❌ Keys cannot unlock your files alone (still need passphrase)

#### Someone Steals Your Key?
- ⚠️ They still need your password/OAuth AND passphrase
- ✅ Remove the stolen key from your account immediately
- ✅ Change your password
- ✅ Your encrypted files remain safe

#### Key Stops Working?
- ✅ Use your backup key
- ✅ Order a replacement
- ✅ Keep at least 2 keys registered

## Advanced: How FIDO2/WebAuthn Works

### Registration Flow:
```
1. User clicks "Register Key"
2. Browser requests user presence (touch)
3. Key generates a new key pair (public + private)
4. Key signs registration data
5. Public key + credential ID stored in SeraVault
6. Private key NEVER leaves the hardware key
```

### Authentication Flow:
```
1. User tries to log in
2. Server sends challenge
3. Browser prompts for key presence
4. Key signs challenge with private key
5. Server verifies signature with public key
6. If valid, authentication succeeds
```

### Why It's Phishing-Resistant:
- Key cryptographically binds to seravault.com domain
- Fake site (seravau1t.com) won't work
- Key verifies domain before signing
- Unlike passwords, keys can't be "tricked"

## Cost Breakdown

| Key Type | Price | Features | Best For |
|----------|-------|----------|----------|
| YubiKey 5 NFC | $50 | USB-A, NFC, multi-protocol | Most users |
| YubiKey 5C NFC | $55 | USB-C, NFC, multi-protocol | New laptops |
| YubiKey Bio | $85 | USB-C, fingerprint | Maximum security |
| Titan Security Key | $30 | USB-A/NFC or USB-C/NFC | Budget option |
| Feitian ePass | $20 | USB-A, basic FIDO2 | Entry level |

**Recommendation**: Buy 2 keys (primary + backup) from the same brand

## Where to Buy

### Official Stores (Recommended):
- **Yubico Store**: yubico.com
- **Google Store**: store.google.com (Titan Keys)
- **Amazon**: Look for "Ships from and sold by [Brand Name]"

### ⚠️ Warning:
- Avoid third-party sellers (risk of tampering)
- Check for tamper-evident packaging
- Register immediately upon receiving

## Support

### Need Help?
- **SeraVault Support**: Contact through your account
- **YubiKey Support**: yubico.com/support
- **FIDO Alliance**: fidoalliance.org

### Additional Resources:
- FIDO2 Specification: fidoalliance.org/specifications
- WebAuthn Guide: webauthn.guide
- YubiKey Setup: yubico.com/setup

---

**Last Updated**: November 2025  
**Compatible with**: SeraVault v1.0+, All modern browsers
