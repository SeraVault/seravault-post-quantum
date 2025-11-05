import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile } from '../firestore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import TermsAcceptanceDialog from './TermsAcceptanceDialog';

/**
 * This component checks if the current user has accepted the latest terms.
 * If not, it shows the terms acceptance dialog on app load.
 * This ensures existing users also accept terms after they've been introduced.
 */
const TermsEnforcement: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkTermsAcceptance = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);
        
        // If user hasn't accepted terms, show dialog
        if (!profile?.termsAcceptedAt) {
          setShowTermsDialog(true);
        }
      } catch (error) {
        console.error('Error checking terms acceptance:', error);
      } finally {
        setChecking(false);
      }
    };

    checkTermsAcceptance();
  }, [user]);

  const handleTermsAccept = async () => {
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        termsAcceptedAt: new Date().toISOString(),
      });
      setShowTermsDialog(false);
    } catch (error) {
      console.error('Error updating terms acceptance:', error);
    }
  };

  const handleTermsDecline = async () => {
    // If user declines, log them out
    const { signOut } = await import('firebase/auth');
    const { auth } = await import('../firebase');
    await signOut(auth);
    setShowTermsDialog(false);
  };

  // Don't render children until we've checked terms status
  if (checking) {
    return null; // or a loading spinner
  }

  return (
    <>
      <TermsAcceptanceDialog
        open={showTermsDialog}
        onAccept={handleTermsAccept}
        onDecline={handleTermsDecline}
      />
      {children}
    </>
  );
};

export default TermsEnforcement;
