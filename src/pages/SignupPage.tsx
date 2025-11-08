import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Alert, 
  Container, 
  Paper, 
  Divider,
  IconButton,
  InputAdornment,
  useTheme,
  alpha,
  LinearProgress
} from '@mui/material';
import { 
  Visibility, 
  VisibilityOff, 
  Google,
  CheckCircleOutline
} from '@mui/icons-material';
import { backendService } from '../backend/BackendService';
import { useNavigate, Link } from 'react-router-dom';
import { createUserProfile } from '../firestore';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import TermsAcceptanceDialog from '../components/TermsAcceptanceDialog';

const SignupPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [pendingSignupType, setPendingSignupType] = useState<'email' | 'google' | null>(null);
  const navigate = useNavigate();
  const theme = useTheme();

  // Password strength indicator
  const getPasswordStrength = () => {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (password.length >= 12) strength += 25;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
    if (/\d/.test(password) && /[^a-zA-Z\d]/.test(password)) strength += 25;
    return strength;
  };

  const passwordStrength = getPasswordStrength();
  const getStrengthColor = () => {
    if (passwordStrength <= 25) return 'error';
    if (passwordStrength <= 50) return 'warning';
    if (passwordStrength <= 75) return 'info';
    return 'success';
  };

  const handleSignup = async () => {
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    // Show terms dialog before creating account
    setPendingSignupType('email');
    setShowTermsDialog(true);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    // Show terms dialog before creating account
    setPendingSignupType('google');
    setShowTermsDialog(true);
  };

  const handleTermsAccept = async () => {
    setShowTermsDialog(false);
    setLoading(true);
    
    try {
      if (pendingSignupType === 'email') {
        const user = await backendService.auth.signUp(email, password);
        await createUserProfile(user.uid, {
          displayName: user.displayName || email,
          email: user.email || '',
          theme: 'dark',
          termsAcceptedAt: new Date().toISOString(),
        });
        navigate('/');
      } else if (pendingSignupType === 'google') {
        const userCredential = await signInWithPopup(auth, new GoogleAuthProvider());
        const user = userCredential.user;
        await createUserProfile(user.uid, {
          displayName: user.displayName || user.email || 'User',
          email: user.email || '',
          theme: 'dark',
          termsAcceptedAt: new Date().toISOString(),
        });
        navigate('/');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setPendingSignupType(null);
      setLoading(false);
    }
  };

  const handleTermsDecline = () => {
    setShowTermsDialog(false);
    setPendingSignupType(null);
    setError('You must accept the Terms of Service and Privacy Policy to create an account');
  };

  return (
    <>
      <TermsAcceptanceDialog
        open={showTermsDialog}
        onAccept={handleTermsAccept}
        onDecline={handleTermsDecline}
      />
      
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
          py: 4,
        }}
      >
        <Container component="main" maxWidth="sm">
          <Paper 
            elevation={6} 
            sx={{ 
              p: { xs: 3, sm: 5 }, 
              borderRadius: 3,
              background: theme.palette.mode === 'dark' 
                ? alpha(theme.palette.background.paper, 0.9)
                : theme.palette.background.paper,
            }}
          >
            {/* Logo/Brand Section */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <img 
                  src="/seravault_logo.svg" 
                  alt="SeraVault" 
                  style={{ height: '60px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
                />
              </Box>
              <Typography component="h1" variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
                Create Account
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Join SeraVault for quantum-safe storage
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <Box 
              component="form" 
              onSubmit={(e) => { 
                e.preventDefault(); 
                handleSignup(); 
              }}
            >
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
                disabled={loading}
                sx={{ mb: 2 }}
                InputProps={{
                  sx: { borderRadius: 2 }
                }}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                sx={{ mb: 1 }}
                InputProps={{
                  sx: { borderRadius: 2 },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              {/* Password Strength Indicator */}
              {password && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Password Strength
                    </Typography>
                    <Typography variant="caption" color={`${getStrengthColor()}.main`} sx={{ fontWeight: 600 }}>
                      {passwordStrength <= 25 && 'Weak'}
                      {passwordStrength > 25 && passwordStrength <= 50 && 'Fair'}
                      {passwordStrength > 50 && passwordStrength <= 75 && 'Good'}
                      {passwordStrength > 75 && 'Strong'}
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={passwordStrength} 
                    color={getStrengthColor()}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>
              )}

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                error={confirmPassword.length > 0 && password !== confirmPassword}
                helperText={confirmPassword.length > 0 && password !== confirmPassword ? 'Passwords do not match' : ''}
                sx={{ mb: 3 }}
                InputProps={{
                  sx: { borderRadius: 2 },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle confirm password visibility"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || password !== confirmPassword}
                sx={{ 
                  py: 1.5, 
                  mb: 2,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>

              <Divider sx={{ my: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  OR
                </Typography>
              </Divider>

              <Button
                fullWidth
                variant="outlined"
                size="large"
                disabled={loading}
                onClick={handleGoogleSignIn}
                startIcon={<Google />}
                sx={{ 
                  py: 1.5,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderWidth: 2,
                  '&:hover': {
                    borderWidth: 2,
                  }
                }}
              >
                Continue with Google
              </Button>

              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Already have an account?{' '}
                  <Link 
                    to="/login" 
                    style={{ 
                      color: theme.palette.primary.main, 
                      textDecoration: 'none',
                      fontWeight: 600
                    }}
                  >
                    Sign In
                  </Link>
                </Typography>
              </Box>
            </Box>

            {/* Security Features */}
            <Box 
              sx={{ 
                mt: 4, 
                pt: 3, 
                borderTop: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, textAlign: 'center' }}>
                What you get:
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CheckCircleOutline sx={{ fontSize: 20, color: 'success.main' }} />
                  <Typography variant="body2" color="text.secondary">
                    Quantum-resistant ML-KEM-768 encryption
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CheckCircleOutline sx={{ fontSize: 20, color: 'success.main' }} />
                  <Typography variant="body2" color="text.secondary">
                    Zero-knowledge architecture
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CheckCircleOutline sx={{ fontSize: 20, color: 'success.main' }} />
                  <Typography variant="body2" color="text.secondary">
                    End-to-end encrypted file sharing
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
        </Container>
      </Box>
    </>
  );
};

export default SignupPage;