import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { PassphraseProvider } from './PassphraseContext';
import { ImportProvider } from '../context/ImportContext';

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    // You can return a loading spinner here
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <PassphraseProvider>
      <ImportProvider>
        <Outlet />
      </ImportProvider>
    </PassphraseProvider>
  );
};

export default ProtectedRoute;
