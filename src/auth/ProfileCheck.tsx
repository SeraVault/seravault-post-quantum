import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { subscribeToUserProfile } from '../firestore';
import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

const ProfileCheck: React.FC = () => {
  const { user } = useAuth();
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Get context from parent (PersistentLayout) to pass through to children
  const context = useOutletContext();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToUserProfile(user.uid, (profile) => {
      console.log('ProfileCheck: Received profile update', { 
        exists: !!profile, 
        hasPublicKey: !!profile?.publicKey,
        uid: user.uid 
      });
      
      if (profile && profile.publicKey) {
        setHasProfile(true);
      } else {
        setHasProfile(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!hasProfile) {
    return <Navigate to="/setup" />;
  }

  // Forward the context to child routes
  return <Outlet context={context} />;
};

export default ProfileCheck;
