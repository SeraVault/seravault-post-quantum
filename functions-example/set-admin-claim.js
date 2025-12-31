// Firebase Functions example for setting admin claims
// This should be deployed as a Firebase Function

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Cloud Function to set admin claims
 * Only existing admins can promote other users to admin
 */
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if the caller is an admin (except for the very first admin)
  const callerUid = context.auth.uid;
  const callerRecord = await admin.auth().getUser(callerUid);
  const isCallerAdmin = callerRecord.customClaims && callerRecord.customClaims.admin;

  // For the very first admin setup, you might want to allow a specific email
  const BOOTSTRAP_ADMIN_EMAIL = 'your-email@example.com'; // Change this!
  const isBootstrapAdmin = context.auth.token.email === BOOTSTRAP_ADMIN_EMAIL;

  if (!isCallerAdmin && !isBootstrapAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied', 
      'Only admins can set admin claims'
    );
  }

  const { email } = data;

  if (!email || typeof email !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Email is required');
  }

  try {
    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // Set admin custom claim
    await admin.auth().setCustomUserClaims(userRecord.uid, { 
      admin: true,
      promotedBy: callerUid,
      promotedAt: new Date().toISOString()
    });

    console.log(`Admin claim set for user: ${email} by ${context.auth.token.email}`);

    return { 
      success: true, 
      message: `Successfully set admin claim for ${email}`,
      uid: userRecord.uid
    };

  } catch (error) {
    console.error('Error setting admin claim:', error);
    
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to set admin claim');
  }
});

/**
 * Cloud Function to remove admin claims
 * Only admins can remove admin claims
 */
exports.removeAdminClaim = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check if the caller is an admin
  const callerUid = context.auth.uid;
  const callerRecord = await admin.auth().getUser(callerUid);
  const isCallerAdmin = callerRecord.customClaims && callerRecord.customClaims.admin;

  if (!isCallerAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied', 
      'Only admins can remove admin claims'
    );
  }

  const { email } = data;

  if (!email || typeof email !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Email is required');
  }

  // Prevent removing your own admin claim
  if (email === context.auth.token.email) {
    throw new functions.https.HttpsError(
      'permission-denied', 
      'Cannot remove your own admin claim'
    );
  }

  try {
    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // Remove admin custom claim
    await admin.auth().setCustomUserClaims(userRecord.uid, { 
      admin: false,
      removedBy: callerUid,
      removedAt: new Date().toISOString()
    });

    console.log(`Admin claim removed for user: ${email} by ${context.auth.token.email}`);

    return { 
      success: true, 
      message: `Successfully removed admin claim for ${email}`,
      uid: userRecord.uid
    };

  } catch (error) {
    console.error('Error removing admin claim:', error);
    
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to remove admin claim');
  }
});