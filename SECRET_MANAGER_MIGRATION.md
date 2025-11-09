# Migration to Cloud Secret Manager

## What Changed

We migrated from the deprecated `functions.config()` to **Cloud Secret Manager** with parameterized configuration.

### Before (Deprecated)
```typescript
// Old way - DEPRECATED, will stop working after December 2025
firebase functions:config:set email.user="user@example.com"
const emailUser = functions.config().email?.user;
```

### After (Current)
```typescript
// New way - Using Secret Manager
import {defineSecret} from "firebase-functions/params";

const emailUser = defineSecret('EMAIL_USER');
const emailPassword = defineSecret('EMAIL_PASSWORD');

export const myFunction = onDocumentCreated(
  {
    document: "path/{id}",
    secrets: [emailUser, emailPassword],
  },
  async (event) => {
    const user = emailUser.value();
    // Use the secret value
  }
);
```

## Benefits

✅ **More Secure**: Secrets encrypted in Cloud Secret Manager  
✅ **Access Control**: Fine-grained IAM permissions  
✅ **Version Control**: Track secret changes  
✅ **Future-Proof**: Won't be decommissioned  
✅ **Free Tier**: 6 secrets + 10k operations/month included  

## Setup Commands

### Set secrets (production):
```bash
./firebase-config.sh
```

Or manually:
```bash
echo -n "your-email@gmail.com" | firebase functions:secrets:set EMAIL_USER
echo -n "your-app-password" | firebase functions:secrets:set EMAIL_PASSWORD
```

### Local development:
Create `functions/.env.local`:
```
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

## Migration Checklist

- [x] Import `defineSecret` from `firebase-functions/params`
- [x] Define secrets at module level
- [x] Bind secrets to functions using `secrets` option
- [x] Access values with `.value()` at runtime
- [x] Update `firebase-config.sh` to use Secret Manager
- [x] Create `.env.local` for local testing
- [x] Update documentation
- [x] Remove old `functions.config()` calls

## References

- [Firebase Config Env Docs](https://firebase.google.com/docs/functions/config-env)
- [Cloud Secret Manager](https://cloud.google.com/secret-manager)
- [Migration Guide](https://firebase.google.com/docs/functions/config-env#migrate-to-dotenv)
