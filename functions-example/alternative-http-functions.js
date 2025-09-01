// Alternative HTTP Functions with CORS support
// Use this if you need HTTP endpoints instead of callable functions

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true }); // Enable CORS for all origins

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * HTTP Function to set admin claims with CORS support
 */
exports.setAdminClaimHTTP = functions.https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Get the authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const idToken = authHeader.split('Bearer ')[1];
      
      // Verify the ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const callerUid = decodedToken.uid;
      const callerEmail = decodedToken.email;

      // Check if the caller is an admin (except for bootstrap)
      const callerRecord = await admin.auth().getUser(callerUid);
      const isCallerAdmin = callerRecord.customClaims && callerRecord.customClaims.admin;

      // Bootstrap admin setup
      const BOOTSTRAP_ADMIN_EMAIL = 'your-email@example.com'; // Change this!
      const isBootstrapAdmin = callerEmail === BOOTSTRAP_ADMIN_EMAIL;

      if (!isCallerAdmin && !isBootstrapAdmin) {
        return res.status(403).json({ error: 'Only admins can set admin claims' });
      }

      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Get user by email
      const userRecord = await admin.auth().getUserByEmail(email);
      
      // Set admin custom claim
      await admin.auth().setCustomUserClaims(userRecord.uid, { 
        admin: true,
        promotedBy: callerUid,
        promotedAt: new Date().toISOString()
      });

      console.log(`Admin claim set for user: ${email} by ${callerEmail}`);

      return res.json({ 
        success: true, 
        message: `Successfully set admin claim for ${email}`,
        uid: userRecord.uid
      });

    } catch (error) {
      console.error('Error setting admin claim:', error);
      
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      
      return res.status(500).json({ error: 'Failed to set admin claim' });
    }
  });
});

// Package.json dependencies you'll need:
/*
{
  "dependencies": {
    "firebase-admin": "^11.0.0",
    "firebase-functions": "^4.0.0",
    "cors": "^2.8.5"
  }
}
*/