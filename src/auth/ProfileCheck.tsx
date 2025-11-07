import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getUserProfile } from '../firestore';
import { Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

const ProfileCheck: React.FC = () => {
  const { user } = useAuth();
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Get context from parent (PersistentLayout) to pass through to children
  const context = useOutletContext();

  useEffect(() => {
    const checkProfile = async () => {
      if (user) {
        const profile = await getUserProfile(user.uid);
        if (profile && profile.publicKey) {
          setHasProfile(true);
        }
      }
      setLoading(false);
    };
    checkProfile();
  }, [user]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!hasProfile) {
    return <Navigate to="/profile" />;
  }

  // Forward the context to child routes
  return <Outlet context={context} />;
};

export default ProfileCheck;
