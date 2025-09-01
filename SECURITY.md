# Firebase Security Rules - SeraVault

## Overview

This document describes the comprehensive security rules implemented for SeraVault's Firebase backend, ensuring that files, forms, and metadata are only accessible by authorized users.

## Security Architecture

### Multi-Layer Security Approach

1. **Firebase Authentication** - User identity verification
2. **Firestore Security Rules** - Database access control
3. **Firebase Storage Rules** - File storage access control  
4. **End-to-End Encryption** - Data protection (files unusable without decryption keys)
5. **Application-Layer Validation** - Additional security checks in the client code

## Firestore Security Rules

### Core Principles

- **Explicit Access Control**: Users can only access resources they own or resources explicitly shared with them
- **Data Validation**: All required fields must be present and properly typed
- **Owner Verification**: Only resource owners can modify or delete resources
- **Sharing Limits**: Reasonable limits on sharing (max 100 users per resource)
- **Deny by Default**: Explicit denial of all other access patterns

### Resource-Specific Rules

#### Users (`/users/{userId}`)
- **Read/Write**: Only the user themselves
- **Purpose**: Personal profile and encryption key storage

#### Folders (`/folders/{folderId}`)
- **Read**: Owner or users in `sharedWith` array
- **Write/Delete**: Owner only
- **Create**: Must be owner and include self in `sharedWith`
- **Validation**: Required fields and proper data types enforced

#### Files (`/files/{fileId}`) - Including Forms
- **Read**: Owner or users in `sharedWith` array  
- **Write/Delete**: Owner only
- **Create**: Must be owner with encrypted key and include self in `sharedWith`
- **Validation**: Ensures encrypted keys exist for the user
- **Forms**: Same rules apply (forms are stored as encrypted files)

#### Groups (`/groups/{groupId}`)
- **Read**: Owner or group members
- **Write/Delete**: Owner only
- **Create**: Must be owner and include self in members list
- **Validation**: Member limit (max 50), required fields enforced

#### Sharing History (`/sharingHistory/{historyId}`)
- **Read/Write/Delete**: Owner only
- **Purpose**: Track sharing activity for audit purposes

### Helper Functions

```javascript
function hasAccess(resource) {
  return request.auth != null && (
    request.auth.uid == resource.data.owner ||
    (resource.data.sharedWith is list && request.auth.uid in resource.data.sharedWith)
  );
}

function isOwner(resourceData) {
  return request.auth != null && request.auth.uid == resourceData.owner;
}

function validSharedWith(sharedWith) {
  return sharedWith is list && 
         sharedWith.size() <= 100 && 
         request.auth.uid in sharedWith;
}
```

## Firebase Storage Rules

### Security Model

Since files are end-to-end encrypted, the storage layer allows broader read access to authenticated users, with the real security enforced through:

1. **Firestore Rules**: Control access to decryption keys
2. **Encryption**: Files are useless without proper decryption keys
3. **Directory Structure**: Files stored under `/files/{userId}/` for organization

### Storage Rules

- **Read**: Any authenticated user (files are encrypted anyway)
- **Write/Create/Delete**: Only file owner can manage files in their directory
- **Organization**: Files stored under user-specific directories

## Security Features

### 🔐 End-to-End Encryption
- **Post-Quantum Cryptography**: ML-KEM-768 for key exchange
- **Symmetric Encryption**: ChaCha20-Poly1305 for file content
- **Metadata Encryption**: File names and sizes are encrypted
- **Key Management**: Each user has encrypted access keys per file

### 🛡️ Access Control
- **Explicit Sharing**: Users must be explicitly added to `sharedWith` arrays
- **Owner Privileges**: Only owners can modify sharing permissions
- **Audit Trail**: All sharing activity logged in `sharingHistory`
- **Group Support**: Users can be organized into groups for easier sharing

### 🔍 Data Validation
- **Required Fields**: All resources must have mandatory fields
- **Type Checking**: Field types are validated (strings, lists, maps)
- **Size Limits**: Reasonable limits on sharing lists and group sizes
- **Format Validation**: Ensures proper data structure

### 🚫 Attack Prevention
- **Injection Protection**: Data types and structures validated
- **Privilege Escalation**: Users cannot grant themselves access to others' resources
- **Malicious Sharing**: Creator must always be included in sharing lists
- **Unauthorized Access**: Explicit deny-all rule for unmatched patterns

## File and Form Sharing Workflow

### 1. File/Form Creation
```
User creates file → 
Encrypted with user's public key → 
Stored in user's directory → 
Metadata saved to Firestore with owner + sharedWith array
```

### 2. Sharing Process
```
Owner adds user to sharedWith array → 
New encrypted key generated for shared user → 
encryptedKeys map updated → 
Shared user gains access to encrypted file + decryption key
```

### 3. Access Verification
```
User requests file → 
Firestore rules check sharedWith array → 
If authorized: User gets file + their encrypted key → 
Client decrypts file with user's private key
```

## Security Best Practices Implemented

### ✅ Principle of Least Privilege
- Users only get access to resources they explicitly need
- No broad access patterns or wildcards for sensitive data

### ✅ Defense in Depth
- Multiple layers: Auth + Rules + Encryption + Client validation
- Each layer provides independent security

### ✅ Zero Trust Architecture
- Every request validated regardless of source
- No implicit trust based on authentication alone

### ✅ Audit and Compliance
- All sharing activity logged
- Clear ownership and access trails
- Data validation ensures integrity

### ✅ Future-Proof Security
- Post-quantum cryptography resistant to quantum computing
- Modular design allows for security updates
- Clear separation between access control and encryption

## Testing Security Rules

### Recommended Tests

1. **Access Control Tests**:
   - Verify users can only access their own resources
   - Confirm sharing works correctly
   - Test unauthorized access is denied

2. **Data Validation Tests**:
   - Ensure required fields are enforced
   - Verify type checking works
   - Test malformed data is rejected

3. **Edge Case Tests**:
   - Empty sharedWith arrays
   - Invalid user IDs in sharing lists
   - Excessive sharing list sizes

### Firebase Security Rules Testing

Use Firebase's rules testing framework:
```bash
firebase emulators:start --only firestore
# Run your security rule tests
```

## Compliance and Regulations

These security rules support compliance with:
- **GDPR**: User data isolation and deletion capabilities
- **CCPA**: User data access control and portability
- **HIPAA**: Healthcare data protection (for medical record forms)
- **SOX**: Financial data security (for financial forms)

## Monitoring and Alerts

Recommended monitoring:
- Failed authentication attempts
- Unusual access patterns
- Large file downloads
- Bulk sharing operations
- Failed rule evaluations

---

**Last Updated**: 2025-08-27  
**Version**: 1.0  
**Contact**: Security team for questions about these rules