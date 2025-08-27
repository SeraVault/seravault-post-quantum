import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Typography,
  Collapse,
  IconButton,
} from '@mui/material';
import {
  Smartphone,
  Computer,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { getBiometricCapabilities } from '../utils/biometricAuth';

const DeviceCapabilityInfo: React.FC = () => {
  const [capabilities, setCapabilities] = useState<{
    available: boolean;
    type: string;
    supportsResidentKeys: boolean;
  }>({ available: false, type: 'none', supportsResidentKeys: false });
  const [deviceInfo, setDeviceInfo] = useState<{
    platform: string;
    browser: string;
    mobile: boolean;
  }>({ platform: 'Unknown', browser: 'Unknown', mobile: false });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const detectCapabilities = async () => {
      const caps = await getBiometricCapabilities();
      setCapabilities(caps);
      
      // Detect device info
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      
      let platform = 'Desktop';
      let browser = 'Unknown';
      
      if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
        platform = userAgent.includes('iphone') ? 'iPhone' : 'iPad';
        browser = userAgent.includes('safari') ? 'Safari' : 'Browser';
      } else if (userAgent.includes('android')) {
        platform = 'Android';
        if (userAgent.includes('chrome')) browser = 'Chrome';
        else if (userAgent.includes('firefox')) browser = 'Firefox';
      } else if (userAgent.includes('windows')) {
        platform = 'Windows';
        if (userAgent.includes('chrome')) browser = 'Chrome';
        else if (userAgent.includes('edge')) browser = 'Edge';
        else if (userAgent.includes('firefox')) browser = 'Firefox';
      } else if (userAgent.includes('mac')) {
        platform = 'macOS';
        if (userAgent.includes('chrome')) browser = 'Chrome';
        else if (userAgent.includes('safari')) browser = 'Safari';
        else if (userAgent.includes('firefox')) browser = 'Firefox';
      }
      
      setDeviceInfo({ platform, browser, mobile });
    };

    detectCapabilities();
  }, []);

  const getRecommendation = () => {
    if (capabilities.available) {
      return {
        severity: 'success' as const,
        message: `✅ Your ${deviceInfo.platform} device supports biometric authentication with ${capabilities.type}`,
        action: 'You can enable biometric login for faster access to your encrypted files.',
      };
    }

    if (deviceInfo.mobile) {
      return {
        severity: 'warning' as const,
        message: `⚠️ Biometric authentication not available on ${deviceInfo.platform} ${deviceInfo.browser}`,
        action: 'Try using Safari on iOS or Chrome on Android for biometric support.',
      };
    }

    return {
      severity: 'info' as const,
      message: `💻 Desktop detected (${deviceInfo.platform} ${deviceInfo.browser})`,
      action: 'Biometric authentication is available on Windows (Hello), macOS (Touch ID), and mobile devices.',
    };
  };

  const getSupportedDevices = () => [
    { icon: <Smartphone />, name: 'iPhone/iPad', requirement: 'Safari + Touch ID/Face ID' },
    { icon: <Smartphone />, name: 'Android', requirement: 'Chrome/Edge + Fingerprint/Face' },
    { icon: <Computer />, name: 'Windows', requirement: 'Chrome/Edge + Windows Hello' },
    { icon: <Computer />, name: 'macOS', requirement: 'Chrome/Safari + Touch ID' },
  ];

  const recommendation = getRecommendation();

  return (
    <Box>
      <Alert severity={recommendation.severity} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {recommendation.message}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {recommendation.action}
          </Typography>
          
          {!capabilities.available && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">
                Don't worry - you can still use your passphrase securely
              </Typography>
              <IconButton 
                size="small" 
                onClick={() => setExpanded(!expanded)}
                sx={{ ml: 'auto' }}
              >
                {expanded ? <ExpandLess /> : <ExpandMore />}
              </IconButton>
            </Box>
          )}
        </Box>
      </Alert>

      <Collapse in={expanded}>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>Supported Devices & Browsers:</strong>
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {getSupportedDevices().map((device, index) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {device.icon}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {device.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {device.requirement}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
          <Typography variant="body2" sx={{ mt: 2 }}>
            <strong>Note:</strong> Even on supported devices, you can always use your passphrase as backup. 
            Biometric authentication is an optional convenience feature.
          </Typography>
        </Alert>
      </Collapse>
    </Box>
  );
};

export default DeviceCapabilityInfo;