import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  TextField,
  IconButton,
  Divider,
  Badge,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Fab,
  AppBar,
  Toolbar,
} from '@mui/material';
import {
  Send as SendIcon,
  Add as AddIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  MoreVert as MoreVertIcon,
  Search as SearchIcon,
  ArrowBack as ArrowBackIcon,
  Home as HomeIcon,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { useNavigate } from 'react-router-dom';
import { ChatService } from '../services/chatService';
import type { Conversation, ChatMessage } from '../types/chat';
import ContactSelector from '../components/ContactSelector';
import ChatMessageList from '../components/ChatMessageList';
import { useTranslation } from 'react-i18next';

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const navigate = useNavigate();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  
  // New conversation dialog
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [newChatType, setNewChatType] = useState<'individual' | 'group'>('individual');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  
  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  
  // Load conversations on mount
  useEffect(() => {
    if (!user || !privateKey) return;
    
    const unsubscribe = ChatService.subscribeToConversations(user.uid, (convos) => {
      setConversations(convos);
      
      // Extract all unique participant IDs
      const allParticipantIds = new Set<string>();
      convos.forEach(convo => {
        convo.participants.forEach(id => {
          if (id !== user.uid) {
            allParticipantIds.add(id);
          }
        });
      });
      
      // Fetch display names for all participants
      const fetchNames = async () => {
        const { getUserProfile } = await import('../firestore');
        const names: Record<string, string> = {};
        
        for (const participantId of allParticipantIds) {
          try {
            const profile = await getUserProfile(participantId);
            if (profile) {
              names[participantId] = profile.displayName || profile.email || 'Unknown User';
            }
          } catch (error) {
            console.error('Error fetching participant profile:', error);
            names[participantId] = 'Unknown User';
          }
        }
        
        setParticipantNames(names);
      };
      
      fetchNames();
    });
    
    return () => unsubscribe();
  }, [user, privateKey]);
  
  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedConversation || !user || !privateKey) return;
    
    const unsubscribe = ChatService.subscribeToMessages(
      selectedConversation.id!,
      user.uid,
      privateKey,
      (msgs) => {
        setMessages(msgs);
      }
    );
    
    // Mark conversation as read
    ChatService.markConversationAsRead(selectedConversation.id!, user.uid);
    
    return () => unsubscribe();
  }, [selectedConversation, user, privateKey]);
  
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation || !user || !privateKey) return;
    
    setSending(true);
    try {
      await ChatService.sendMessage(
        selectedConversation.id!,
        user.uid,
        privateKey,
        messageInput.trim()
      );
      setMessageInput('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };
  
  const handleCreateConversation = async () => {
    if (!user || !privateKey || selectedContacts.length === 0) return;
    
    setLoading(true);
    try {
      const conversationId = await ChatService.createConversation(
        user.uid,
        selectedContacts,
        newChatType,
        privateKey,
        newChatType === 'group' ? groupName : undefined,
        newChatType === 'group' ? groupDescription : undefined
      );
      
      // Find and select the new conversation
      const newConvo = conversations.find(c => c.id === conversationId);
      if (newConvo) {
        setSelectedConversation(newConvo);
      }
      
      // Reset dialog
      setNewChatDialogOpen(false);
      setSelectedContacts([]);
      setGroupName('');
      setGroupDescription('');
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const getConversationName = (conversation: Conversation): string => {
    if (conversation.type === 'group') {
      return conversation.groupName || 'Group Chat';
    }
    
    // For individual chats, show the other participant's name
    const otherParticipantId = conversation.participants.find(id => id !== user?.uid);
    if (!otherParticipantId) return 'Unknown';
    
    return participantNames[otherParticipantId] || 'Loading...';
  };
  
  const getUnreadCount = (conversation: Conversation): number => {
    // This would be calculated based on messages read status
    return 0; // Placeholder
  };
  
  if (!user || !privateKey) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography>Please log in to access chat</Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <IconButton
            edge="start"
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('chat.title', 'Chat')}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Main Chat Container */}
      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        {/* Conversations List */}
        <Paper
          sx={{
            width: { xs: '100%', md: 320 },
            borderRight: 1,
            borderColor: 'divider',
            display: {
              xs: selectedConversation ? 'none' : 'flex', // Hide on mobile when chat selected
              md: 'flex' // Always show on desktop
            },
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('chat.search', 'Search conversations...')}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
        </Box>
        
        <List sx={{ flexGrow: 1, overflow: 'auto', py: 0 }}>
          {conversations.map((conversation) => (
            <ListItemButton
              key={conversation.id}
              selected={selectedConversation?.id === conversation.id}
              onClick={() => setSelectedConversation(conversation)}
            >
              <ListItemAvatar>
                <Avatar>
                  {conversation.type === 'group' ? <GroupIcon /> : <PersonIcon />}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1" noWrap>
                      {getConversationName(conversation)}
                    </Typography>
                    {getUnreadCount(conversation) > 0 && (
                      <Badge badgeContent={getUnreadCount(conversation)} color="primary" />
                    )}
                  </Box>
                }
                secondary={
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {conversation.lastMessagePreview || 'No messages yet'}
                  </Typography>
                }
              />
            </ListItemButton>
          ))}
        </List>
        
        <Divider />
        
        <Box sx={{ p: 1, display: 'flex', gap: 1 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<PersonIcon />}
            onClick={() => {
              setNewChatType('individual');
              setNewChatDialogOpen(true);
            }}
          >
            {t('chat.newChat', 'New Chat')}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<GroupIcon />}
            onClick={() => {
              setNewChatType('group');
              setNewChatDialogOpen(true);
            }}
          >
            {t('chat.newGroup', 'New Group')}
          </Button>
        </Box>
      </Paper>
      
      {/* Chat Area */}
      <Box 
        sx={{ 
          flexGrow: 1, 
          display: {
            xs: selectedConversation ? 'flex' : 'none', // Only show on mobile when chat selected
            md: 'flex' // Always show on desktop
          },
          flexDirection: 'column', 
          overflow: 'hidden',
          width: { xs: '100%', md: 'auto' }
        }}
      >
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <Paper
              sx={{
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <IconButton
                  onClick={() => setSelectedConversation(null)}
                  sx={{ 
                    display: { xs: 'inline-flex', md: 'none' } // Only show on mobile
                  }}
                >
                  <ArrowBackIcon />
                </IconButton>
                <Avatar>
                  {selectedConversation.type === 'group' ? <GroupIcon /> : <PersonIcon />}
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {getConversationName(selectedConversation)}
                  </Typography>
                  {selectedConversation.type === 'group' && (
                    <Typography variant="caption" color="text.secondary">
                      {selectedConversation.participants.length} members
                    </Typography>
                  )}
                </Box>
              </Box>
              
              <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <MoreVertIcon />
              </IconButton>
              
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
              >
                <MenuItem onClick={() => setMenuAnchor(null)}>
                  View Info
                </MenuItem>
                <MenuItem onClick={() => setMenuAnchor(null)}>
                  Mute Notifications
                </MenuItem>
                <MenuItem onClick={() => setMenuAnchor(null)}>
                  Leave Conversation
                </MenuItem>
              </Menu>
            </Paper>
            
            {/* Messages */}
            <ChatMessageList
              messages={messages}
              currentUserId={user.uid}
              conversationId={selectedConversation?.id}
              participantNames={participantNames}
            />
            
            {/* Message Input */}
            <Paper
              sx={{
                p: 2,
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                <TextField
                  fullWidth
                  multiline
                  maxRows={4}
                  placeholder={t('chat.typeMessage', 'Type a message...')}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={sending}
                />
                <IconButton
                  color="primary"
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sending}
                >
                  {sending ? <CircularProgress size={24} /> : <SendIcon />}
                </IconButton>
              </Box>
            </Paper>
          </>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              color: 'text.secondary',
            }}
          >
            <Typography variant="h5" gutterBottom>
              {t('chat.selectConversation', 'Select a conversation')}
            </Typography>
            <Typography variant="body2">
              {t('chat.selectConversationHint', 'Choose a chat from the list or start a new conversation')}
            </Typography>
          </Box>
        )}
      </Box>
      
      {/* New Conversation Dialog */}
      <Dialog
        open={newChatDialogOpen}
        onClose={() => setNewChatDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {newChatType === 'group' ? t('chat.createGroup', 'Create Group Chat') : t('chat.createChat', 'Create Chat')}
        </DialogTitle>
        <DialogContent>
          {newChatType === 'group' && (
            <>
              <TextField
                fullWidth
                label={t('chat.groupName', 'Group Name')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                sx={{ mb: 2, mt: 1 }}
              />
              <TextField
                fullWidth
                label={t('chat.groupDescription', 'Description (optional)')}
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                multiline
                rows={2}
                sx={{ mb: 2 }}
              />
            </>
          )}
          
          <Typography variant="subtitle2" gutterBottom>
            {t('chat.selectParticipants', 'Select Participants')}
          </Typography>
          <ContactSelector
            selectedContacts={selectedContacts}
            onSelectionChange={setSelectedContacts}
            currentUserId={user.uid}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewChatDialogOpen(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleCreateConversation}
            variant="contained"
            disabled={selectedContacts.length === 0 || (newChatType === 'group' && !groupName.trim()) || loading}
          >
            {loading ? <CircularProgress size={24} /> : t('common.create', 'Create')}
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </Box>
  );
};

export default ChatPage;
