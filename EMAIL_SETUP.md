# Email Setup Guide for SeraVault

## Overview

The `onUserInvitationCreated` Cloud Function automatically sends invitation emails when users invite others to SeraVault.

## Email Configuration

The Cloud Function uses **nodemailer** to send emails. By default, it's configured for Gmail, but you can use any email service.

### Option 1: Gmail with App Password (Recommended for Testing)

1. **Enable 2-Factor Authentication** on your Gmail account
   - Go to: https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Create an App Password**
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the generated 16-character password

3. **Set Firebase Environment Variables**
   ```bash
   firebase functions:config:set email.user="your-email@gmail.com" email.password="your-app-password"
   ```

4. **Redeploy the function**
   ```bash
   firebase deploy --only functions:onUserInvitationCreated
   ```

### Option 2: SendGrid (Recommended for Production)

1. **Sign up for SendGrid**
   - Go to: https://sendgrid.com/
   - Create a free account (100 emails/day)

2. **Create an API Key**
   - Settings → API Keys → Create API Key
   - Give it "Mail Send" permissions

3. **Update the email transporter** in `functions/src/index.ts`:
   ```typescript
   const emailTransporter = nodemailer.createTransport({
     host: 'smtp.sendgrid.net',
     port: 587,
     auth: {
       user: 'apikey',
       pass: process.env.SENDGRID_API_KEY,
     },
   });
   ```

4. **Set Firebase Environment Variable**
   ```bash
   firebase functions:config:set sendgrid.api_key="YOUR_SENDGRID_API_KEY"
   ```

5. **Update code to use config**:
   ```typescript
   pass: functions.config().sendgrid?.api_key || process.env.SENDGRID_API_KEY || '',
   ```

### Option 3: Firebase Extensions (Easiest)

Use the official **Trigger Email from Firestore** extension:

```bash
firebase ext:install firebase/firestore-send-email
```

This requires configuring SMTP settings or using a service like SendGrid.

## Development Mode

In the emulator (when `FUNCTIONS_EMULATOR=true`), emails are logged to the console instead of being sent:

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

## Troubleshooting

### "Invalid login" error with Gmail
- Make sure 2FA is enabled
- Use an App Password, not your regular password
- Check that the email/password are set correctly in Firebase config

### Emails not sending
- Check function logs for errors
- Verify SMTP credentials
- Check spam folder
- Ensure the function has internet access (Cloud Functions require Blaze plan)

### Rate limits
- Gmail: ~500 emails/day for free accounts
- SendGrid: 100 emails/day on free tier
- Consider upgrading for production use

## Security Notes

- Never commit email credentials to git
- Use Firebase environment variables or Secret Manager
- In production, use a dedicated email service (SendGrid, AWS SES, etc.)
- Consider implementing rate limiting to prevent abuse

## Environment Variables

Current configuration uses:
- `EMAIL_USER`: Email address for sending (default: noreply@seravault.app)
- `EMAIL_PASSWORD`: Email password or API key
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
