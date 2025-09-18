import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Button,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import {
  Share,
  Edit,
  Cancel,
  Notifications,
  MarkEmailRead,
  Delete,
  FilterList,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { NotificationService, type Notification } from '../services/notificationService';

interface NotificationCenterProps {
  onFileClick?: (fileId: string) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`notification-tabpanel-${index}`}
      aria-labelledby={`notification-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 2 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onFileClick }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());

  // Load notifications on component mount
  useEffect(() => {
    if (!user) return;

    const loadNotifications = async () => {
      try {
        setLoading(true);
        setError(null);
        const userNotifications = await NotificationService.getUserNotifications(user.uid, 100);
        setNotifications(userNotifications);
      } catch (err) {
        setError('Failed to load notifications');
        console.error('Error loading notifications:', err);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();

    // Subscribe to real-time updates
    const unsubscribe = NotificationService.subscribeToUserNotifications(
      user.uid,
      (newNotifications) => {
        setNotifications(newNotifications);
      },
      100
    );

    return unsubscribe;
  }, [user]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setSelectedNotifications(new Set());
  };

  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.isRead) {
        await NotificationService.markAsRead(notification.id!);
      }

      // Navigate to file if callback provided and fileId exists
      if (onFileClick && notification.fileId) {
        onFileClick(notification.fileId);
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    
    try {
      await NotificationService.markAllAsRead(user.uid);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleToggleSelect = (notificationId: string) => {
    const newSelected = new Set(selectedNotifications);
    if (newSelected.has(notificationId)) {
      newSelected.delete(notificationId);
    } else {
      newSelected.add(notificationId);
    }
    setSelectedNotifications(newSelected);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'file_shared':
        return <Share color="primary" />;
      case 'file_modified':
        return <Edit color="info" />;
      case 'file_unshared':
        return <Cancel color="warning" />;
      default:
        return <Notifications />;
    }
  };

  const formatDateTime = (createdAt: any): string => {
    if (!createdAt) return '';
    
    let date: Date;
    if (typeof createdAt === 'object' && 'toDate' in createdAt) {
      date = createdAt.toDate();
    } else if (createdAt instanceof Date) {
      date = createdAt;
    } else {
      date = new Date(createdAt);
    }
    
    return date.toLocaleString();
  };

  const getFilteredNotifications = () => {
    switch (tabValue) {
      case 0: // All
        return notifications;
      case 1: // Unread
        return notifications.filter(n => !n.isRead);
      case 2: // File Shared
        return notifications.filter(n => n.type === 'file_shared');
      case 3: // File Modified
        return notifications.filter(n => n.type === 'file_modified');
      default:
        return notifications;
    }
  };

  const filteredNotifications = getFilteredNotifications();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (!user) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">Please sign in to view notifications</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ mt: 2 }}>
          Loading notifications...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ p: 3, pb: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4">
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button
              onClick={handleMarkAllAsRead}
              startIcon={<MarkEmailRead />}
              variant="outlined"
            >
              Mark all read ({unreadCount})
            </Button>
          )}
        </Box>

        {/* Tabs */}
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="notification tabs">
          <Tab label={`All (${notifications.length})`} />
          <Tab label={`Unread (${unreadCount})`} />
          <Tab label="Shared" />
          <Tab label="Modified" />
        </Tabs>
      </Box>

      <Divider />

      {/* Notification Lists */}
      <TabPanel value={tabValue} index={0}>
        <NotificationList 
          notifications={filteredNotifications}
          onNotificationClick={handleNotificationClick}
          getNotificationIcon={getNotificationIcon}
          formatDateTime={formatDateTime}
        />
      </TabPanel>
      
      <TabPanel value={tabValue} index={1}>
        <NotificationList 
          notifications={filteredNotifications}
          onNotificationClick={handleNotificationClick}
          getNotificationIcon={getNotificationIcon}
          formatDateTime={formatDateTime}
        />
      </TabPanel>
      
      <TabPanel value={tabValue} index={2}>
        <NotificationList 
          notifications={filteredNotifications}
          onNotificationClick={handleNotificationClick}
          getNotificationIcon={getNotificationIcon}
          formatDateTime={formatDateTime}
        />
      </TabPanel>
      
      <TabPanel value={tabValue} index={3}>
        <NotificationList 
          notifications={filteredNotifications}
          onNotificationClick={handleNotificationClick}
          getNotificationIcon={getNotificationIcon}
          formatDateTime={formatDateTime}
        />
      </TabPanel>
    </Box>
  );
};

// Separate component for the notification list to avoid repetition
interface NotificationListProps {
  notifications: Notification[];
  onNotificationClick: (notification: Notification) => void;
  getNotificationIcon: (type: string) => React.ReactNode;
  formatDateTime: (createdAt: any) => string;
}

const NotificationList: React.FC<NotificationListProps> = ({
  notifications,
  onNotificationClick,
  getNotificationIcon,
  formatDateTime
}) => {
  if (notifications.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No notifications to display
        </Typography>
      </Box>
    );
  }

  return (
    <List>
      {notifications.map((notification, index) => (
        <React.Fragment key={notification.id}>
          <ListItem
            button
            onClick={() => onNotificationClick(notification)}
            sx={{
              backgroundColor: notification.isRead ? 'transparent' : 'action.hover',
              borderLeft: notification.isRead ? 'none' : '4px solid',
              borderColor: 'primary.main',
              '&:hover': {
                backgroundColor: 'action.selected',
              },
            }}
          >
            <ListItemIcon>
              {getNotificationIcon(notification.type)}
            </ListItemIcon>
            
            <ListItemText
              primary={
                <Typography 
                  variant="subtitle1" 
                  sx={{ 
                    fontWeight: notification.isRead ? 'normal' : 'bold',
                    mb: 0.5
                  }}
                >
                  {notification.title}
                </Typography>
              }
              secondary={
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {notification.message}
                  </Typography>
                  
                  {notification.fileName && (
                    <Chip
                      label={notification.fileName}
                      size="small"
                      variant="outlined"
                      sx={{ mb: 1, mr: 1 }}
                    />
                  )}
                  
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(notification.createdAt)}
                  </Typography>
                  
                  {notification.senderDisplayName && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                      from {notification.senderDisplayName}
                    </Typography>
                  )}
                </Box>
              }
            />
          </ListItem>
          {index < notifications.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </List>
  );
};

export default NotificationCenter;