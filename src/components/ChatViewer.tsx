import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Close,
  Send as SendIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  MoreVert as MoreVertIcon,
  Share as ShareIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { ChatService } from '../services/chatService';
import type { Conversation, ChatMessage } from '../types/chat';
import ChatMessageList from './ChatMessageList';
import { getUserProfile } from '../firestore';

interface ChatViewerProps {
  open: boolean;
  conversationId: string | null;
  onClose: () => void;
  onShare?: () => void;
}

const ChatViewer: React.FC<ChatViewerProps> = ({
  open,
  conversationId,
  onClose,
  onShare,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const { privateKey } = usePassphrase();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation and participant names
  useEffect(() => {
    if (!conversationId || !user || !privateKey) return;

    setLoading(true);

    ChatService.getConversation(conversationId)
      .then(async (convo) => {
        if (convo) {
          setConversation(convo);

          // Load participant names
          const names: Record<string, string> = {};
          for (const participantId of convo.participants) {
            if (participantId !== user.uid) {
              try {
                const profile = await getUserProfile(participantId);
                if (profile) {
                  names[participantId] = profile.displayName || profile.email || 'Unknown User';
                }
              } catch (error: unknown) {
                console.error('Error fetching participant profile:', error);
                names[participantId] = 'Unknown User';
              }
            }
          }
          setParticipantNames(names);
        }
      })
      .catch((error) => {
        console.error('Failed to load conversation:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [conversationId, user, privateKey]);

  // Subscribe to messages
  useEffect(() => {
    if (!conversationId || !user || !privateKey || !conversation) return;

    const unsubscribe = ChatService.subscribeToMessages(
      conversationId,
      user.uid,
      privateKey,
      (msgs) => {
        setMessages(msgs);
      }
    );

    // Mark conversation as read
    ChatService.markConversationAsRead(conversationId, user.uid);

    return () => unsubscribe();
  }, [conversationId, user, privateKey, conversation]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !conversationId || !user || !privateKey) return;

    setSending(true);
    try {
      await ChatService.sendMessage(
        conversationId,
        user.uid,
        privateKey,
        messageInput.trim()
      );
      setMessageInput('');
    } catch (error: unknown) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getConversationName = (): string => {
    if (!conversation) return 'Loading...';

    if (conversation.type === 'group') {
      return conversation.groupName || 'Group Chat';
    }

    // For individual chats, show the other participant's name
    const otherParticipantId = conversation.participants.find((id) => id !== user?.uid);
    if (!otherParticipantId) return 'Unknown';

    return participantNames[otherParticipantId] || 'Loading...';
  };

  const handleDownload = () => {
    if (!conversation || messages.length === 0) return;

    // Create a formatted text representation of the chat
    const chatName = getConversationName();
    let chatText = `${chatName}\n`;
    chatText += `${'='.repeat(chatName.length)}\n\n`;

    messages.forEach((msg) => {
      const senderName = msg.senderId === user?.uid 
        ? 'You' 
        : participantNames[msg.senderId] || msg.senderName || 'Unknown User';
      
      let timestamp = '';
      if (msg.timestamp instanceof Date) {
        timestamp = msg.timestamp.toLocaleString();
      } else if (msg.timestamp && typeof msg.timestamp === 'object' && 'toDate' in msg.timestamp) {
        timestamp = (msg.timestamp as any).toDate().toLocaleString();
      }
      
      const content = (msg as any).content || '[Encrypted]';
      chatText += `[${timestamp}] ${senderName}:\n${content}\n\n`;
    });

    // Create and download the file
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chatName.replace(/[^a-z0-9]/gi, '_')}_chat_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setMenuAnchor(null);
  };

  const handlePrint = () => {
    if (!conversation || messages.length === 0) return;

    // Create a formatted HTML representation of the chat
    const chatName = getConversationName();
    let chatHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${chatName}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; }
          h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
          .message { margin: 15px 0; padding: 10px; border-left: 3px solid #1976d2; }
          .message-header { font-weight: bold; color: #1976d2; margin-bottom: 5px; }
          .message-time { font-size: 0.85em; color: #666; }
          .message-content { margin-top: 5px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>${chatName}</h1>
    `;

    messages.forEach((msg) => {
      const senderName = msg.senderId === user?.uid 
        ? 'You' 
        : participantNames[msg.senderId] || msg.senderName || 'Unknown User';
      
      let timestamp = '';
      if (msg.timestamp instanceof Date) {
        timestamp = msg.timestamp.toLocaleString();
      } else if (msg.timestamp && typeof msg.timestamp === 'object' && 'toDate' in msg.timestamp) {
        timestamp = (msg.timestamp as any).toDate().toLocaleString();
      }
      
      const content = (msg as any).content || '[Encrypted]';
      const escapedContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      chatHtml += `
        <div class="message">
          <div class="message-header">${senderName}</div>
          <div class="message-time">${timestamp}</div>
          <div class="message-content">${escapedContent}</div>
        </div>
      `;
    });

    chatHtml += `
      </body>
      </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(chatHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
    
    setMenuAnchor(null);
  };

  if (!user || !privateKey) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          height: isMobile ? '100%' : '80vh',
          maxHeight: isMobile ? '100%' : '80vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          py: 2,
          px: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
          <Avatar>
            {conversation?.type === 'group' ? <GroupIcon /> : <PersonIcon />}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" noWrap>
              {getConversationName()}
            </Typography>
            {conversation?.type === 'group' && (
              <Typography variant="caption" color="text.secondary">
                {conversation.participants.length} members
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {onShare && (
            <IconButton onClick={onShare} size="small">
              <ShareIcon />
            </IconButton>
          )}
          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} size="small">
            <MoreVertIcon />
          </IconButton>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem onClick={handleDownload}>
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Download Chat</ListItemText>
          </MenuItem>
          <MenuItem onClick={handlePrint}>
            <ListItemIcon>
              <PrintIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Print Chat</ListItemText>
          </MenuItem>
        </Menu>
      </DialogTitle>

      {/* Messages Area */}
      <DialogContent
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <Typography color="text.secondary">Loading conversation...</Typography>
          </Box>
        ) : conversation ? (
          <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
            <ChatMessageList
              messages={messages}
              currentUserId={user.uid}
              participantNames={participantNames}
            />
            <div ref={messagesEndRef} />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <Typography color="text.secondary">Conversation not found</Typography>
          </Box>
        )}
      </DialogContent>

      <Divider />

      {/* Message Input */}
      <DialogActions
        sx={{
          p: 2,
          gap: 2,
        }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder={t('chat.typeMessage', 'Type a message...')}
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={sending || !conversation}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
            },
          }}
        />
        <IconButton
          color="primary"
          onClick={handleSendMessage}
          disabled={!messageInput.trim() || sending || !conversation}
          sx={{
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': {
              bgcolor: 'primary.dark',
            },
            '&.Mui-disabled': {
              bgcolor: 'action.disabledBackground',
            },
          }}
        >
          <SendIcon />
        </IconButton>
      </DialogActions>
    </Dialog>
  );
};

export default ChatViewer;
