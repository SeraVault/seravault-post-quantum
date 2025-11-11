import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Divider,
  Box,
  ListItemIcon,
  ListItemText,
  Chip,
  Button,
  Tooltip,
} from '@mui/material';
import {
  Notifications,
  NotificationsNone,
  Share,
  Edit,
  Cancel,
  MarkEmailRead,
  PersonAdd,
  Person,
  Security,
  Chat,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { NotificationService, type Notification } from '../services/notificationService';

interface NotificationBellProps {
  className?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ className }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const open = Boolean(anchorEl);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) return;

    const unsubscribe = NotificationService.subscribeToUserNotifications(
      user.uid,
      (newNotifications) => {
        console.log('📬 Received notifications update:', {
          total: newNotifications.length,
          details: newNotifications.map(n => ({
            id: n.id,
            type: n.type,
            isRead: n.isRead,
            fileId: n.fileId,
            message: n.message
          }))
        });
        setNotifications(newNotifications);
        const unread = newNotifications.filter(n => !n.isRead);
        console.log(`📊 Unread notifications: ${unread.length} of ${newNotifications.length}`);
        setUnreadCount(unread.length);
      },
      20 // Limit to 20 recent notifications
    );

    return unsubscribe;
  }, [user]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

    const handleNotificationClick = async (notification: Notification) => {
    try {
      console.log('� Notification clicked:', notification);
      
      // Mark as read FIRST and wait for it to complete
      if (!notification.isRead && notification.id) {
        console.log(`�️ Deleting notification ${notification.id}...`);
        await NotificationService.markAsRead(notification.id);
        console.log(`✅ Successfully deleted notification ${notification.id}`);
        
        // Remove from local state immediately for responsive UI
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
        setUnreadCount(prev => Math.max(0, prev - 1));
        
        // Give a small delay for Firestore real-time update to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
      } else if (!notification.id) {
        console.warn('⚠️ Notification has no ID, cannot mark as read');
      } else {
        console.log('📖 Notification already read');
      }
      
      // Navigate to file or perform relevant action based on notification type
      console.log('📍 Notification details:', {
        type: notification.type,
        fileId: notification.fileId,
        fileName: notification.fileName,
        conversationId: notification.conversationId,
        contactRequestId: notification.contactRequestId
      });
      
      // Close the menu BEFORE navigating
      handleClose();
      
      // Handle contact request notifications
      if (notification.type === 'contact_request' || notification.type === 'contact_accepted') {
        console.log(`👥 Navigating to contacts page for ${notification.type}`);
        // Navigate to contacts page with requests tab selected
        navigate('/contacts?tab=requests');
      }
      // Handle user invitation notifications
      else if (notification.type === 'user_invitation') {
        console.log(`📩 User invitation notification`);
        // User is already registered, just show them in contacts
        navigate('/contacts');
      }
      // Handle chat message notifications
      else if (notification.type === 'chat_message' && notification.conversationId) {
        console.log(`💬 Opening chat: ${notification.conversationId}`);
        // Open chat modal via URL parameter
        navigate(`/?chat=${notification.conversationId}`);
      }
      // Navigate to file if fileId exists
      else if (notification.fileId) {
        console.log(`🔗 Navigating to file: ${notification.fileId}`);
        // Navigate to home page with file parameter
        navigate(`/?file=${notification.fileId}`);
      }
    } catch (error) {
      console.error('❌ Error handling notification click:', error);
      // Close menu even on error
      handleClose();
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      await NotificationService.markAllAsRead(user.uid);
      handleClose();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    } finally {
      setLoading(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'file_shared':
        return <Share fontSize="small" color="primary" />;
      case 'file_modified':
        return <Edit fontSize="small" color="info" />;
      case 'file_unshared':
        return <Cancel fontSize="small" color="warning" />;
      case 'contact_request':
        return <PersonAdd fontSize="small" color="primary" />;
      case 'contact_accepted':
        return <Person fontSize="small" color="success" />;
      case 'file_share_request':
        return <Security fontSize="small" color="warning" />;
      case 'chat_message':
        return <Chat fontSize="small" color="primary" />;
      default:
        return <Notifications fontSize="small" />;
    }
  };

  const formatTimeAgo = (createdAt: any): string => {
    if (!createdAt) return '';
    
    let date: Date;
    if (typeof createdAt === 'object' && 'toDate' in createdAt) {
      date = createdAt.toDate();
    } else if (createdAt instanceof Date) {
      date = createdAt;
    } else {
      date = new Date(createdAt);
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          onClick={handleClick}
          className={className}
          color="inherit"
          size="large"
        >
          <Badge badgeContent={unreadCount} color="error">
            {unreadCount > 0 ? <Notifications /> : <NotificationsNone />}
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            width: 400,
            maxWidth: '90vw',
            maxHeight: 500,
            overflow: 'auto',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Notifications
            </Typography>
            {unreadCount > 0 && (
              <Button
                size="small"
                onClick={handleMarkAllAsRead}
                disabled={loading}
                startIcon={<MarkEmailRead />}
              >
                Mark all read
              </Button>
            )}
          </Box>
          {unreadCount > 0 && (
            <Typography variant="body2" color="text.secondary">
              {unreadCount} unread
            </Typography>
          )}
        </Box>

        <Divider />

        {/* Notifications list - only show unread notifications */}
        {notifications.filter(n => !n.isRead).length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <NotificationsNone sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No unread notifications
            </Typography>
          </Box>
        ) : (
          notifications.filter(n => !n.isRead).map((notification) => (
            <MenuItem
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              sx={{
                py: 1.5,
                px: 2,
                borderLeft: notification.isRead ? 'none' : '3px solid',
                borderColor: 'primary.main',
                backgroundColor: notification.isRead ? 'transparent' : 'action.hover',
                '&:hover': {
                  backgroundColor: 'action.selected',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getNotificationIcon(notification.type)}
              </ListItemIcon>
              
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: notification.isRead ? 'normal' : 'bold' }}>
                      {notification.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>
                      {formatTimeAgo(notification.createdAt)}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Box 
                    sx={{ 
                      mt: 0.5,
                      wordWrap: 'break-word',
                      whiteSpace: 'normal',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      fontSize: '0.875rem',
                      color: 'text.secondary'
                    }}
                  >
                    {notification.message}
                    {notification.fileName && (
                      <Chip
                        label={notification.fileName}
                        size="small"
                        variant="outlined"
                        sx={{ 
                          mt: 1, 
                          maxWidth: 200,
                          display: 'block',
                          '& .MuiChip-label': {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }
                        }}
                      />
                    )}
                  </Box>
                }
                secondaryTypographyProps={{ component: 'div' }}
              />
            </MenuItem>
          ))
        )}

        {/* Show more option if there are many unread notifications */}
        {notifications.filter(n => !n.isRead).length >= 20 && (
          <>
            <Divider />
            <MenuItem onClick={handleClose} sx={{ justifyContent: 'center' }}>
              <Typography variant="body2" color="primary">
                View all notifications
              </Typography>
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;