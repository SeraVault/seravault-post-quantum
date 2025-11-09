# Email Setup Guide for SeraVault

## Overview

The `onUserInvitationCreated` Cloud Function automatically sends invitation emails when users invite others to SeraVault.

## Email Configuration Setup

This guide explains how to configure email sending for SeraVault's invitation system.

## Modern Configuration with Secret Manager (Recommended)

⚠️ **Important**: Firebase deprecated `functions.config()` and it will be decommissioned after December 2025. We now use **Cloud Secret Manager** for secure credential storage.

### Quick Setup

1. **Edit the configuration script**:
   ```bash
   nano firebase-config.sh
   ```
   
2. **Update with your credentials**:
   ```bash
   EMAIL_USER="your-email@gmail.com"
   EMAIL_PASSWORD="your-app-password-here"
   ```

3. **Run the script**:
   ```bash
   chmod +x firebase-config.sh
   ./firebase-config.sh
   ```

4. **Deploy**:
   ```bash
   firebase deploy --only functions
   ```

The script will securely store your credentials in Google Cloud Secret Manager.

## Email Service Options

### Option 2: SendGrid (Recommended for Production)

1. **Sign up for SendGrid**
   - Go to: https://sendgrid.com/
   - Create a free account (100 emails/day)

2. **Create an API Key**
   - Settings → API Keys → Create API Key
   - Give it "Mail Send" permissions

3. **Set the secret**:
   ```bash
   echo -n "YOUR_SENDGRID_API_KEY" | firebase functions:secrets:set SENDGRID_API_KEY
   ```

4. **Update code** to use the secret (in `functions/src/index.ts`):
   ```typescript
   import {defineSecret} from "firebase-functions/params";
   
   const sendgridApiKey = defineSecret('SENDGRID_API_KEY');
   
   // Update your function to bind the secret:
   export const myFunction = onDocumentCreated(
     {
       document: "path/{id}",
       secrets: [sendgridApiKey],
     },
     async (event) => {
       const transporter = nodemailer.createTransport({
         host: 'smtp.sendgrid.net',
         port: 587,
         auth: {
           user: 'apikey',
           pass: sendgridApiKey.value(),
         },
       });
     }
   );
   ```

### Option 3: Firebase Extensions (Easiest)

Use the official **Trigger Email from Firestore** extension:

```bash
firebase ext:install firebase/firestore-send-email
```

This requires configuring SMTP settings or using a service like SendGrid.

## Local Development with Emulator

For local testing, create `functions/.env.local`:

```bash
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
```

The emulator will use these values instead of Secret Manager:

```bash
firebase emulators:start
```

When `FUNCTIONS_EMULATOR=true`, emails are logged to console instead of being sent:

```
📧 [DEV MODE] Would send email:
To: user@example.com
Subject: John Doe invited you to SeraVault
Body: [HTML content]
```

## Email Template

The invitation email includes:
- ✅ Personalized invitation from sender
- ✅ Optional custom message
- ✅ Direct link to signup with invitation ID: `/signup?invite={invitationId}`
- ✅ List of SeraVault features
- ✅ Responsive HTML design
- ✅ 30-day expiration notice

## Testing

### Test Locally with Emulator
```bash
firebase emulators:start
```

Then create an invitation through the app. Check the emulator logs for the email content.

### Test in Production

1. Ensure email credentials are configured
2. Create an invitation through the app
3. Check the recipient's email inbox
4. Click the link to verify it navigates to: `/signup?invite={invitationId}`

## Monitoring

View function logs:
```bash
firebase functions:log --only onUserInvitationCreated
```

Or in Firebase Console:
- Functions → onUserInvitationCreated → Logs

## Managing Secrets

View your secrets:
```bash
# List all secrets
firebase functions:secrets:get EMAIL_USER

# View secret value
firebase functions:secrets:access EMAIL_USER
```

Update a secret:
```bash
echo -n "new-value" | firebase functions:secrets:set EMAIL_USER
# Then redeploy functions
firebase deploy --only functions
```

Delete a secret:
```bash
firebase functions:secrets:destroy EMAIL_USER
```

## Troubleshooting

### "Invalid login" error with Gmail
- Make sure 2FA is enabled
- Use an App Password, not your regular password
- Run `./firebase-config.sh` to set credentials correctly

### Emails not sending
- Check function logs for errors
- Verify secrets are set: `firebase functions:secrets:get EMAIL_USER`
- Check spam folder
- Ensure the function has internet access (Cloud Functions require Blaze plan)

### "Secret not bound to function" error
- Make sure the function includes `secrets: [emailUser, emailPassword]` in its configuration
- Redeploy the function after updating

### Rate limits
- Gmail: ~500 emails/day for free accounts
- SendGrid: 100 emails/day on free tier
- Consider upgrading for production use

## Security Notes

- ✅ Never commit email credentials to git
- ✅ Use Cloud Secret Manager for production (current setup)
- ✅ Use `.env.local` for local development only
- ✅ In production, use a dedicated email service (SendGrid, AWS SES, etc.)
- ✅ Consider implementing rate limiting to prevent abuse
- ✅ Secrets are encrypted and access-controlled by Google Cloud

## Secret Manager Billing

Secret Manager allows:
- **6 active secret versions** per month at no cost
- **10,000 access operations** per month at no cost
- After that: $0.03 per 10,000 access operations

For most projects, this stays within the free tier.

## Configuration Summary

Current setup uses **Cloud Secret Manager** with:
- `EMAIL_USER`: Email address for sending
- `EMAIL_PASSWORD`: Email password or App Password

For local testing, use `functions/.env.local` file.
- `APP_URL`: Base URL for invitation links (default: https://seravault-8c764.web.app)

Set them with:
```bash
firebase functions:config:set email.user="email" email.password="pass" app.url="https://your-domain.com"
```

Access in code:
```typescript
const config = functions.config();
user: config.email?.user || process.env.EMAIL_USER
```
