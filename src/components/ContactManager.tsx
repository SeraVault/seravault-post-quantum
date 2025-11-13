import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  Chip,
  Tab,
  Tabs,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Tooltip,
  Divider,
  Badge,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Person,
  PersonAdd,
  Block,
  Check,
  Close,
  Email,
  Schedule,
  Group,
  Edit,
  Send,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';
import { usePassphrase } from '../auth/PassphraseContext';
import { ContactService, type Contact, type ContactRequest, type UserInvitation } from '../services/contactService';
import { type Group as GroupType, getUserGroups } from '../firestore';
import { hexToBytes } from '../crypto/quantumSafeCrypto';
import GroupManagement from './GroupManagement';

interface ContactManagerProps {
  onClose?: () => void;
  initialTab?: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const ContactManager: React.FC<ContactManagerProps> = ({ onClose: _, initialTab = 0 }) => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tabValue, setTabValue] = useState(initialTab);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<ContactRequest[]>([]);
  const [sentInvitations, setSentInvitations] = useState<UserInvitation[]>([]);
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add contact dialog
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactMessage, setNewContactMessage] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  
  // Group management dialog
  const [groupManagementOpen, setGroupManagementOpen] = useState(false);

  // Update tab when initialTab prop changes
  useEffect(() => {
    setTabValue(initialTab);
  }, [initialTab]);

  // Load data on component mount
  useEffect(() => {
    if (!user) return;

    const loadContactData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Convert private key string to Uint8Array if available
        const privateKeyBytes = privateKey ? hexToBytes(privateKey) : undefined;
        
        // Load groups separately since it might fail if no private key
        let groupsData: GroupType[] = [];
        try {
          groupsData = await getUserGroups(user.uid, privateKeyBytes);
        } catch (groupError) {
          console.warn('Failed to load groups:', groupError);
          // Don't fail the entire load if groups fail
        }
        
        // Only load contacts initially - real-time listeners will handle requests and invitations
        const contactsData = await ContactService.getUserContacts(user.uid);

        setContacts(contactsData);
        setGroups(groupsData);
      } catch (err) {
        console.error('Error loading contact data:', err);
        // Only show error if it's a real error, not just empty data
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (!errorMessage.includes('No such document') && !errorMessage.includes('not found')) {
          setError('Failed to load contact data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadContactData();

    // Subscribe to real-time incoming contact requests
    const unsubscribeIncoming = ContactService.subscribeToContactRequests(
      user.uid,
      (requests) => {
        setContactRequests(requests);
      }
    );

    // Subscribe to real-time outgoing contact requests
    const unsubscribeOutgoing = ContactService.subscribeToSentContactRequests(
      user.uid,
      (requests) => {
        console.log('📤 Real-time sent requests update:', requests);
        setSentRequests(requests);
      }
    );

    // Subscribe to real-time sent invitations
    const unsubscribeInvitations = ContactService.subscribeToSentInvitations(
      user.uid,
      (invitations) => {
        console.log('📧 Real-time invitations update:', invitations);
        setSentInvitations(invitations);
      }
    );

    return () => {
      unsubscribeIncoming();
      unsubscribeOutgoing();
      unsubscribeInvitations();
    };
  }, [user, privateKey]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleAddContact = async () => {
    if (!user || !newContactEmail.trim()) return;
    
    try {
      setAddingContact(true);
      const result = await ContactService.sendContactRequest(
        user.uid,
        newContactEmail.trim(),
        newContactMessage.trim() || undefined
      );
      
      // Check if result is an invitation (for non-existing users)
      if (typeof result === 'object' && result && 'invitationId' in result && 'invitationData' in result) {
        console.log('📧 Invitation created - email will be sent automatically by Cloud Function');
        
        // Show success message - the server will send the email automatically
        alert(`✅ Invitation sent to ${newContactEmail.trim()}!\n\nThey will receive an email with a link to create their SeraVault account and connect with you.`);
      } else {
        // Regular contact request sent to existing user
        console.log(`✅ Contact request sent to existing user ${newContactEmail.trim()}`);
      }
      
      // Real-time listeners will update the lists automatically
      setAddContactOpen(false);
      setNewContactEmail('');
      setNewContactMessage('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send contact request');
    } finally {
      setAddingContact(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!user) return;
    
    try {
      await ContactService.acceptContactRequest(requestId, user.uid);
      // Refresh contacts list
      const contactsData = await ContactService.getUserContacts(user.uid);
      setContacts(contactsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!user) return;
    
    try {
      await ContactService.declineContactRequest(requestId, user.uid);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline request');
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!user) return;
    
    try {
      await ContactService.cancelContactRequest(requestId);
      // Real-time listener will update the list automatically
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request');
    }
  };

  const handleBlockUser = async (contactUserId: string) => {
    if (!user) return;
    
    try {
      await ContactService.blockUser(user.uid, contactUserId);
      // Refresh contacts list
      const contactsData = await ContactService.getUserContacts(user.uid);
      setContacts(contactsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block user');
    }
  };


  const handleCancelInvitation = async (invitationId: string) => {
    if (!user) return;
    
    try {
      await ContactService.cancelInvitation(invitationId);
      // Real-time listener will update the list automatically
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invitation');
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!user) return;
    
    try {
      await ContactService.resendInvitation(invitationId);
      // Refresh invitations list to show updated timestamp
      const invitationsData = await ContactService.getSentInvitations(user.uid);
      setSentInvitations(invitationsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation');
    }
  };

  const getContactDisplayInfo = (contact: Contact, currentUserId: string) => {
    const isUser1 = contact.userId1 === currentUserId;
    return {
      name: isUser1 ? contact.user2DisplayName : contact.user1DisplayName,
      email: isUser1 ? contact.user2Email : contact.user1Email,
      userId: isUser1 ? contact.userId2 : contact.userId1,
    };
  };

  const getMemberDisplayNames = (memberIds: string[]) => {
    if (!user) return [];
    return memberIds.map(memberId => {
      const contact = contacts.find(c => 
        (c.userId1 === user.uid && c.userId2 === memberId) ||
        (c.userId2 === user.uid && c.userId1 === memberId)
      );
      if (contact) {
        return getContactDisplayInfo(contact, user.uid).name;
      }
      return 'Unknown User';
    });
  };

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  if (!user) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">Please sign in to manage contacts</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ mt: 2 }}>
          Loading contacts...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ p: 3, pb: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4">
            Contacts
          </Typography>
          <Box>
            {isMobile ? (
              <Tooltip title="Add Contact">
                <IconButton
                  onClick={() => setAddContactOpen(true)}
                  color="primary"
                  sx={{
                    mr: 1,
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    }
                  }}
                >
                  <PersonAdd />
                </IconButton>
              </Tooltip>
            ) : (
              <Button
                startIcon={<PersonAdd />}
                variant="contained"
                onClick={() => setAddContactOpen(true)}
                sx={{ mr: 1 }}
              >
                Add Contact
              </Button>
            )}
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Tabs */}
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons={isMobile ? "auto" : false}
          allowScrollButtonsMobile
        >
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Person />
                Contacts ({contacts.length})
              </Box>
            } 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge badgeContent={contactRequests.length} color="error">
                  <Email />
                </Badge>
                Requests ({contactRequests.length})
              </Box>
            } 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Send />
                Sent ({sentRequests.filter(req => req.status === 'pending').length})
              </Box>
            } 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Schedule />
                Invitations ({sentInvitations.filter(inv => inv.status === 'pending').length})
              </Box>
            } 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Group />
                Groups ({groups.length})
              </Box>
            } 
          />
        </Tabs>
      </Box>

      <Divider />

      {/* Contacts Tab */}
      <TabPanel value={tabValue} index={0}>
        {contacts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Person sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No contacts yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add contacts to securely share files with them
            </Typography>
            {isMobile ? (
              <Tooltip title="Add Your First Contact">
                <IconButton
                  onClick={() => setAddContactOpen(true)}
                  color="primary"
                  size="large"
                  sx={{
                    border: '1px solid',
                    borderColor: 'primary.main',
                  }}
                >
                  <PersonAdd />
                </IconButton>
              </Tooltip>
            ) : (
              <Button
                startIcon={<PersonAdd />}
                variant="outlined"
                onClick={() => setAddContactOpen(true)}
              >
                Add Your First Contact
              </Button>
            )}
          </Box>
        ) : (
          <List>
            {contacts.map((contact) => {
              const { name, email, userId } = getContactDisplayInfo(contact, user.uid);
              return (
                <ListItem key={contact.id} divider>
                  <ListItemAvatar>
                    <Avatar>
                      {name.charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={name}
                    secondary={
                      <>
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                          {email}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Connected on {formatDate(contact.acceptedAt)}
                        </Typography>
                        {contact.metadata?.sharedFilesCount && (
                          <Chip
                            label={`${contact.metadata.sharedFilesCount} files shared`}
                            size="small"
                            variant="outlined"
                            sx={{ ml: 1, display: 'inline-block', mt: 0.5 }}
                          />
                        )}
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Block user">
                      <IconButton 
                        edge="end" 
                        color="error"
                        onClick={() => handleBlockUser(userId)}
                      >
                        <Block />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
          </List>
        )}
      </TabPanel>

      {/* Contact Requests Tab */}
      <TabPanel value={tabValue} index={1}>
        {contactRequests.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Email sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No pending requests
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Contact requests from other users will appear here
            </Typography>
          </Box>
        ) : (
          <List>
            {contactRequests.map((request) => (
              <ListItem key={request.id} divider>
                <ListItemAvatar>
                  <Avatar>
                    {request.fromUserDisplayName.charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box>
                      <Typography component="span" variant="subtitle1">
                        Contact request from {request.fromUserDisplayName}
                      </Typography>
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                        {request.fromUserEmail}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <>
                      {request.message && (
                        <Typography component="span" variant="body2" sx={{ mb: 1, display: 'block' }}>
                          "{request.message}"
                        </Typography>
                      )}
                      {request.triggerEvent?.type === 'file_share_attempt' && (
                        <Alert severity="info" sx={{ mb: 1, display: 'block' }}>
                          <Typography variant="body2">
                            This user tried to share a file "{request.triggerEvent.fileName}" with you
                          </Typography>
                        </Alert>
                      )}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                        <Schedule sx={{ fontSize: 16, mr: 0.5 }} />
                        Received {formatDate(request.createdAt)}
                      </Typography>
                    </>
                  }
                />
                <ListItemSecondaryAction>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Accept request">
                      <IconButton
                        color="success"
                        onClick={() => handleAcceptRequest(request.id!)}
                      >
                        <Check />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Decline request">
                      <IconButton
                        color="error"
                        onClick={() => handleDeclineRequest(request.id!)}
                      >
                        <Close />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </TabPanel>

      {/* Sent Requests Tab */}
      <TabPanel value={tabValue} index={2}>
        {sentRequests.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Send sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No pending sent requests
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Contact requests you send to existing users will appear here
            </Typography>
          </Box>
        ) : (
          <List>
            {sentRequests.map((request) => {
              const isPending = request.status === 'pending';
              
              return (
                <ListItem key={request.id} divider>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: isPending ? 'warning.main' : 'success.main' }}>
                      {request.toUserDisplayName.charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box>
                        <Typography component="span" variant="subtitle1">
                          {request.toUserDisplayName}
                        </Typography>
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                          {request.toUserEmail}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography component="span" variant="body2" color="text.primary">
                          Status: 
                        </Typography>
                        {' '}
                        <Chip
                          label={request.status}
                          size="small"
                          color={
                            request.status === 'pending' ? 'warning' :
                            request.status === 'accepted' ? 'success' :
                            'default'
                          }
                          sx={{ ml: 1 }}
                        />
                        {request.message && (
                          <>
                            <br />
                            <Typography component="span" variant="body2" sx={{ mt: 1, display: 'block' }}>
                              Message: "{request.message}"
                            </Typography>
                          </>
                        )}
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                          <Schedule sx={{ fontSize: 16, mr: 0.5 }} />
                          Sent {formatDate(request.createdAt)}
                        </Typography>
                      </>
                    }
                  />
                  {isPending && (
                    <ListItemSecondaryAction>
                      <Tooltip title="Cancel request">
                        <IconButton
                          edge="end"
                          onClick={() => handleCancelRequest(request.id!)}
                          color="error"
                        >
                          <Close />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </TabPanel>

      {/* Sent Invitations Tab */}
      <TabPanel value={tabValue} index={3}>
        {sentInvitations.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Schedule sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No pending invitations
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Invitations you send to non-registered users will appear here
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Invitations expire after 30 days
              </Typography>
            </Box>
            <List>
              {sentInvitations.map((invitation) => {
                const isPending = invitation.status === 'pending';
                const isExpired = invitation.expiresAt && new Date() > new Date((invitation.expiresAt as any).toDate ? (invitation.expiresAt as any).toDate() : invitation.expiresAt);
                
                return (
                  <ListItem key={invitation.id} divider>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: isPending ? 'warning.main' : 'grey.500' }}>
                        {isPending ? <Schedule /> : <Email />}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={invitation.toEmail}
                      secondary={
                        <>
                          <Typography component="span" variant="body2" color="text.primary">
                            Status: 
                          </Typography>
                          {' '}
                          <Chip
                            label={isExpired ? 'Expired' : invitation.status}
                            size="small"
                            color={
                              isExpired ? 'error' :
                              invitation.status === 'pending' ? 'warning' :
                              invitation.status === 'accepted' ? 'success' :
                              'default'
                            }
                            sx={{ ml: 1 }}
                          />
                          <br />
                          {`Sent: ${formatDate(invitation.createdAt)}`}
                          {invitation.message && (
                            <>
                              <br />
                              Message: "{invitation.message}"
                            </>
                          )}
                        </>
                      }
                    />
                    {isPending && !isExpired && (
                      <ListItemSecondaryAction>
                        <Tooltip title="Resend invitation (extends expiry)">
                          <IconButton
                            edge="end"
                            onClick={() => handleResendInvitation(invitation.id!)}
                            sx={{ mr: 1 }}
                          >
                            <Email />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Cancel invitation">
                          <IconButton
                            edge="end"
                            onClick={() => handleCancelInvitation(invitation.id!)}
                            color="error"
                          >
                            <Close />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    )}
                  </ListItem>
                );
              })}
            </List>
          </>
        )}
      </TabPanel>

      {/* Groups Tab */}
      <TabPanel value={tabValue} index={4}>
        {groups.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Group sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No groups yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Create groups to easily share files with multiple contacts at once
            </Typography>
            {isMobile ? (
              <IconButton
                onClick={() => setGroupManagementOpen(true)}
                color="primary"
                size="large"
                sx={{
                  border: '1px solid',
                  borderColor: 'primary.main',
                }}
              >
                <Group />
              </IconButton>
            ) : (
              <Button
                startIcon={<Group />}
                variant="outlined"
                onClick={() => setGroupManagementOpen(true)}
              >
                Create Your First Group
              </Button>
            )}
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Manage your groups for easy file sharing
              </Typography>
              {isMobile ? (
                <Tooltip title="Manage Groups">
                  <IconButton
                    onClick={() => setGroupManagementOpen(true)}
                    color="primary"
                    sx={{
                      backgroundColor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      }
                    }}
                  >
                    <Group />
                  </IconButton>
                </Tooltip>
              ) : (
                <Button
                  startIcon={<Group />}
                  variant="contained"
                  size="small"
                  onClick={() => setGroupManagementOpen(true)}
                >
                  Manage Groups
                </Button>
              )}
            </Box>
            <List>
              {groups.map((group) => (
                <ListItem key={group.id} divider>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      <Group />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={group.name}
                    secondary={
                      <>
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                          {Array.isArray(group.members) ? group.members.length : 0} member{(Array.isArray(group.members) ? group.members.length : 0) !== 1 ? 's' : ''}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {Array.isArray(group.members) ? getMemberDisplayNames(group.members).join(', ') : 'No members'}
                        </Typography>
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="Manage group">
                      <IconButton 
                        edge="end" 
                        onClick={() => setGroupManagementOpen(true)}
                      >
                        <Edit />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </TabPanel>

      {/* Add Contact Dialog */}
      <Dialog open={addContactOpen} onClose={() => setAddContactOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Contact</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Email Address"
            type="email"
            fullWidth
            variant="outlined"
            value={newContactEmail}
            onChange={(e) => setNewContactEmail(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Message (optional)"
            multiline
            rows={3}
            fullWidth
            variant="outlined"
            value={newContactMessage}
            onChange={(e) => setNewContactMessage(e.target.value)}
            placeholder="Hi! I'd like to connect with you on SeraVault to share files securely."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddContactOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAddContact}
            variant="contained"
            disabled={!newContactEmail.trim() || addingContact}
            startIcon={addingContact ? <CircularProgress size={16} /> : <PersonAdd />}
          >
            {addingContact ? 'Sending...' : 'Send Request'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Group Management Dialog */}
      <GroupManagement 
        open={groupManagementOpen} 
        onClose={async () => {
          setGroupManagementOpen(false);
          // Refresh groups data after management
          if (user) {
            try {
              // Convert private key string to Uint8Array if available
              const privateKeyBytes = privateKey ? hexToBytes(privateKey) : undefined;
              const groupsData = await getUserGroups(user.uid, privateKeyBytes);
              setGroups(groupsData);
            } catch (err) {
              console.error('Error refreshing groups:', err);
            }
          }
        }} 
      />
    </Box>
  );
};

export default ContactManager;