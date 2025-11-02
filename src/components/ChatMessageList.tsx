import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Done as DoneIcon,
  DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import type { ChatMessage } from '../types/chat';
import { format } from 'date-fns';
import MessageReactions from './MessageReactions';

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  conversationId?: string;
  participantNames?: Record<string, string>; // Optional: map of userId -> displayName
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ 
  messages, 
  currentUserId,
  conversationId,
  participantNames = {}
}) => {
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [selectedMessage, setSelectedMessage] = React.useState<ChatMessage | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleMessageMenu = (event: React.MouseEvent<HTMLElement>, message: ChatMessage) => {
    setMenuAnchor(event.currentTarget);
    setSelectedMessage(message);
  };
  
  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    // Just now (less than 1 minute)
    if (diffInMinutes < 1) {
      return 'Just now';
    }
    
    // Minutes ago (1-59 minutes)
    if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    // Hours ago (1-23 hours)
    if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    // Yesterday with time
    if (diffInDays === 1) {
      return `Yesterday at ${format(date, 'h:mm a')}`;
    }
    
    // This week (2-6 days ago)
    if (diffInDays < 7) {
      return `${format(date, 'EEEE')} at ${format(date, 'h:mm a')}`;
    }
    
    // Older messages (show date and time)
    return format(date, 'MMM d, yyyy at h:mm a');
  };
  
  const isRead = (message: ChatMessage): boolean => {
    if (!message.readBy) return false;
    // Check if all participants except sender have read
    return Object.keys(message.readBy).length > 1;
  };
  
  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: 'auto',
        p: 2,
        backgroundColor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.map((message, index) => {
        const isOwn = message.senderId === currentUserId;
        const showAvatar = index === 0 || messages[index - 1].senderId !== message.senderId;
        const content = (message as any).content || '[Encrypted]';
        
        return (
          <Box
            key={message.id}
            sx={{
              display: 'flex',
              justifyContent: isOwn ? 'flex-end' : 'flex-start',
              mb: 1,
              alignItems: 'flex-end',
              gap: 1,
            }}
          >
            {!isOwn && showAvatar && (
              <Avatar sx={{ width: 32, height: 32 }}>
                {message.senderName?.[0] || '?'}
              </Avatar>
            )}
            
            {!isOwn && !showAvatar && (
              <Box sx={{ width: 32 }} />
            )}
            
            <Paper
              sx={{
                p: 1.5,
                maxWidth: '70%',
                backgroundColor: isOwn ? 'primary.main' : 'background.paper',
                color: isOwn ? 'primary.contrastText' : 'text.primary',
                borderRadius: 2,
                position: 'relative',
                '&:hover .message-menu': {
                  opacity: 1,
                },
              }}
            >
              {!isOwn && showAvatar && (
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  {message.senderName || 'Unknown'}
                </Typography>
              )}
              
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {content}
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', mt: 0.5 }}>
                <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.7rem' }}>
                  {formatTimestamp(message.timestamp)}
                </Typography>
                
                {isOwn && (
                  message.readBy && Object.keys(message.readBy).length > 1 ? (
                    <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                  ) : (
                    <DoneIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                  )
                )}
              </Box>

              {/* Emoji Reactions */}
              {conversationId && (
                <MessageReactions
                  conversationId={conversationId}
                  message={message}
                  currentUserId={currentUserId}
                  userNames={participantNames}
                />
              )}
              
              <IconButton
                className="message-menu"
                size="small"
                onClick={(e) => handleMessageMenu(e, message)}
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  color: isOwn ? 'primary.contrastText' : 'text.secondary',
                }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Paper>
          </Box>
        );
      })}
      
      <div ref={messagesEndRef} />
      
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => setMenuAnchor(null)}>Copy</MenuItem>
        {selectedMessage?.senderId === currentUserId && (
          <>
            <MenuItem onClick={() => setMenuAnchor(null)}>Edit</MenuItem>
            <MenuItem onClick={() => setMenuAnchor(null)}>Delete</MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
};

export default ChatMessageList;
