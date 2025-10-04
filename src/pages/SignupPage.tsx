import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Alert, Container, Paper, Divider } from '@mui/material';
import { backendService } from '../backend/BackendService';
import { useNavigate, Link } from 'react-router-dom';
import { createUserProfile } from '../firestore';

const SignupPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignup = async () => {
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      const user = await backendService.auth.signUp(email, password);
      await createUserProfile(user.uid, {
        displayName: user.displayName || email,
        email: user.email || '',
        theme: 'dark',
      });
      navigate('/');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(errorMessage);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      const userCredential = await signInWithPopup(auth, new GoogleAuthProvider());
      const user = userCredential.user;
      await createUserProfile(user.uid, {
        displayName: user.displayName || user.email || 'User',
        email: user.email || '',
        theme: 'dark',
      });
      navigate('/');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(errorMessage);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper elevation={3} sx={{ padding: 4, marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">
          Sign Up
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 2, width: '100%' }}>{error}</Alert>}
        <Box component="form" onSubmit={(e) => { e.preventDefault(); handleSignup(); }} sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="confirmPassword"
            label="Confirm Password"
            type="password"
            id="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Sign Up
          </Button>
          <Box display="flex" justifyContent="flex-end">
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Typography variant="body2">
                Already have an account? Login
              </Typography>
            </Link>
          </Box>
        </Box>
        <Divider sx={{ my: 2, width: '100%' }}>OR</Divider>
        <Button
          fullWidth
          variant="outlined"
          onClick={handleGoogleSignIn}
        >
          Sign up with Google
        </Button>
      </Paper>
    </Container>
  );
};

export default SignupPage;