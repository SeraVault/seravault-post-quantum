import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { ContactService, type Contact, type ContactRequest } from '../services/contactService';
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
  isMobile?: boolean;
}

function TabPanel({ children, value, index, isMobile = false }: TabPanelProps) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: isMobile ? 1 : 3 }}>{children}</Box>}
    </div>
  );
}

const ContactManager: React.FC<ContactManagerProps> = ({ onClose: _, initialTab = 0 }) => {
  const { user } = useAuth();
  const { privateKey } = usePassphrase();
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tabValue, setTabValue] = useState(initialTab);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<ContactRequest[]>([]);
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Compute sent invitations from sent requests with isInvitation flag
  const sentInvitations = sentRequests.filter(req => req.isInvitation === true);
  
  // Debug logging for sentInvitations
  console.log('🔍 [RENDER] Computing sentInvitations:', {
    sentRequestsLength: sentRequests.length,
    sentInvitationsLength: sentInvitations.length,
    sentRequestsData: sentRequests.map(r => ({ id: r.id, toEmail: r.toEmail, isInvitation: r.isInvitation })),
    sentInvitationsData: sentInvitations.map(i => ({ id: i.id, toEmail: i.toEmail, isInvitation: i.isInvitation }))
  });
  
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
    console.log('🎯 ContactManager useEffect starting, user:', user?.uid);
    if (!user) {
      console.log('❌ No user, returning early');
      return;
    }

    const loadContactData = async () => {
      console.log('📥 loadContactData starting for user:', user.uid);
      try {
        setLoading(true);
        setError(null);
        
        // Convert private key string to Uint8Array if available
        const privateKeyBytes = privateKey ? hexToBytes(privateKey) : undefined;
        console.log('🔑 Private key available:', !!privateKeyBytes);
        
        // Load groups separately since it might fail if no private key
        let groupsData: GroupType[] = [];
        try {
          console.log('👥 Calling getUserGroups...');
          groupsData = await getUserGroups(user.uid, privateKeyBytes);
          console.log('✅ getUserGroups succeeded, groups:', groupsData.length);
        } catch (groupError) {
          console.warn('⚠️ Failed to load groups:', groupError);
          // Don't fail the entire load if groups fail
        }
        
        console.log('💾 Setting groups state:', groupsData.length);
        setGroups(groupsData);
      } catch (err) {
        console.error('❌ Error loading contact data:', err);
        // Only show error if it's a real error, not just empty data
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (!errorMessage.includes('No such document') && !errorMessage.includes('not found')) {
          setError('Failed to load contact data. Please try again.');
        }
      } finally {
        console.log('🏁 loadContactData finished');
        setLoading(false);
      }
    };

    console.log('🚀 About to call loadContactData');
    loadContactData();

    console.warn('🔌 [CONTACT MANAGER] Setting up realtime subscriptions for user:', user.uid);
    console.warn('🔌 [CONTACT MANAGER] User email:', user.email);
    
    // Subscribe to real-time contacts (no need for initial getUserContacts call)
    const unsubscribeContacts = ContactService.subscribeToContacts(
      user.uid,
      (contactsData) => {
        console.log('👥 Real-time contacts update:', contactsData);
        setContacts(contactsData);
        setLoading(false); // Clear loading state when first data arrives
      }
    );

    // Subscribe to real-time incoming contact requests
    console.warn('🔌 [CONTACT MANAGER] About to subscribe to contact requests for:', user.uid);
    const unsubscribeIncoming = ContactService.subscribeToContactRequests(
      user.uid,
      (requests) => {
        console.log('📬 Real-time incoming contact requests update:', requests);
        console.log('📬 Incoming requests count:', requests.length);
        console.log('📬 Full request data:', JSON.stringify(requests, null, 2));
        setContactRequests(requests);
      }
    );

    // Subscribe to real-time outgoing contact requests (includes both requests and invitations)
    const unsubscribeOutgoing = ContactService.subscribeToSentContactRequests(
      user.uid,
      (requests) => {
        console.log('📤 Real-time sent requests update (includes invitations):', requests);
        console.log('📤 Requests breakdown:', {
          total: requests.length,
          invitations: requests.filter(r => r.isInvitation === true).length,
          regularRequests: requests.filter(r => !r.isInvitation).length,
          pending: requests.filter(r => r.status === 'pending').length
        });
        setSentRequests(requests);
      }
    );

    return () => {
      unsubscribeContacts();
      unsubscribeIncoming();
      unsubscribeOutgoing();
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
        const title = t('contacts.invitationSentTitle', 'Invitation sent to {{email}}!', { email: newContactEmail.trim() });
        const message = t('contacts.invitationSentMessage', "An invitation email will be sent to them with a link to create their SeraVault account. When they sign up using that email, you'll be automatically connected.");
        alert(`✅ ${title}\n\n${message}`);
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
      await ContactService.respondToContactRequest(requestId, 'declined');
    } catch (err) {
      console.error('Error declining request:', err);
      setError('Failed to decline request. Please try again.');
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
      // No need to refresh - real-time listener will update automatically
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
        <Typography variant="h6">{t('contacts.pleaseSignIn', 'Please sign in to manage contacts')}</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body1" sx={{ mt: 2 }}>
          {t('contacts.loadingContacts', 'Loading contacts...')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ p: isMobile ? 2 : 3, pb: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant={isMobile ? "h5" : "h4"}>
            {t('contacts.title', 'Contacts')}
          </Typography>
          <Box>
            {isMobile ? (
              <Tooltip title={t('contacts.addContact', 'Add Contact')}>
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
                {t('contacts.addContact', 'Add Contact')}
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
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            '& .MuiTab-root': {
              minWidth: isMobile ? 'auto' : 120,
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              px: isMobile ? 1 : 2,
            }
          }}
        >
          <Tab 
            icon={<Person fontSize="small" />}
            iconPosition={isMobile ? "top" : "start"}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isMobile ? 'column' : 'row' }}>
                <span>{t('contacts.contactsTab', 'Contacts')}</span>
                <Chip label={contacts.length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
              </Box>
            }
          />
          <Tab 
            icon={
              <Badge badgeContent={contactRequests.length} color="error">
                <Email fontSize="small" />
              </Badge>
            }
            iconPosition={isMobile ? "top" : "start"}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isMobile ? 'column' : 'row' }}>
                <span>{t('contacts.requestsTab', 'Requests')}</span>
                <Chip label={contactRequests.length} size="small" color={contactRequests.length > 0 ? "error" : "default"} sx={{ height: 18, fontSize: '0.7rem' }} />
              </Box>
            }
          />
          <Tab 
            icon={<Send fontSize="small" />}
            iconPosition={isMobile ? "top" : "start"}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isMobile ? 'column' : 'row' }}>
                <span>{t('contacts.sentTab', 'Sent')}</span>
                <Chip label={sentRequests.filter(req => !req.isInvitation && req.status === 'pending').length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
              </Box>
            }
          />
          <Tab 
            icon={<Schedule fontSize="small" />}
            iconPosition={isMobile ? "top" : "start"}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isMobile ? 'column' : 'row' }}>
                <span>{t('contacts.invitationsTab', 'Invitations')}</span>
                <Chip label={sentInvitations.length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
              </Box>
            }
          />
          <Tab 
            icon={<Group fontSize="small" />}
            iconPosition={isMobile ? "top" : "start"}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isMobile ? 'column' : 'row' }}>
                <span>{t('contacts.groupsTab', 'Groups')}</span>
                <Chip label={groups.length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
              </Box>
            }
          />
        </Tabs>
      </Box>

      <Divider />

      {/* Contacts Tab */}
      <TabPanel value={tabValue} index={0} isMobile={isMobile}>
        {contacts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Person sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('contacts.noContactsYet', 'No contacts yet')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('contacts.addContactsToShare', 'Add contacts to securely share files with them')}
            </Typography>
            {isMobile ? (
              <Tooltip title={t('contacts.addFirstContact', 'Add Your First Contact')}>
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
                {t('contacts.addFirstContact', 'Add Your First Contact')}
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
                          {t('contacts.connectedOn', 'Connected on {{date}}', { date: formatDate(contact.acceptedAt) })}
                        </Typography>
                        {contact.metadata?.sharedFilesCount && (
                          <Chip
                            label={t('contacts.filesShared', '{{count}} files shared', { count: contact.metadata.sharedFilesCount })}
                            size="small"
                            variant="outlined"
                            sx={{ ml: 1, display: 'inline-block', mt: 0.5 }}
                          />
                        )}
                      </>
                    }
                    sx={isMobile ? { pr: 7 } : undefined}
                  />
                  {!isMobile ? (
                    <ListItemSecondaryAction>
                      <Tooltip title={t('contacts.blockUser', 'Block user')}>
                        <IconButton 
                          edge="end" 
                          color="error"
                          onClick={() => handleBlockUser(userId)}
                        >
                          <Block />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  ) : (
                    <Box sx={{ ml: 'auto', pl: 1 }}>
                      <Tooltip title={t('contacts.blockUser', 'Block user')}>
                        <IconButton 
                          size="small"
                          color="error"
                          onClick={() => handleBlockUser(userId)}
                        >
                          <Block fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </TabPanel>

      {/* Contact Requests Tab */}
      <TabPanel value={tabValue} index={1} isMobile={isMobile}>
        {contactRequests.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Email sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('contacts.noPendingRequests', 'No pending requests')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('contacts.requestsWillAppear', 'Contact requests from other users will appear here')}
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
                        {t('contacts.contactRequestFrom', 'Contact request from {{name}}', { name: request.fromUserDisplayName })}
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
                            {t('contacts.triedToShareFile', 'This user tried to share a file "{{fileName}}" with you', { fileName: request.triggerEvent.fileName })}
                          </Typography>
                        </Alert>
                      )}
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                        <Schedule sx={{ fontSize: 16, mr: 0.5 }} />
                        {t('contacts.received', 'Received {{date}}', { date: formatDate(request.createdAt) })}
                      </Typography>
                    </>
                  }
                  sx={isMobile ? { pr: 1 } : undefined}
                />
                {!isMobile ? (
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Tooltip title={t('contacts.acceptRequest', 'Accept request')}>
                        <IconButton
                          color="success"
                          onClick={() => handleAcceptRequest(request.id!)}
                        >
                          <Check />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('contacts.declineRequest', 'Decline request')}>
                        <IconButton
                          color="error"
                          onClick={() => handleDeclineRequest(request.id!)}
                        >
                          <Close />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </ListItemSecondaryAction>
                ) : (
                  <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto', pl: 1 }}>
                    <Tooltip title={t('contacts.acceptRequest', 'Accept request')}>
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => handleAcceptRequest(request.id!)}
                      >
                        <Check fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('contacts.declineRequest', 'Decline request')}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeclineRequest(request.id!)}
                      >
                        <Close fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </TabPanel>

      {/* Sent Requests Tab */}
      <TabPanel value={tabValue} index={2} isMobile={isMobile}>
        {sentRequests.filter(req => !req.isInvitation).length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Send sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('contacts.noPendingSentRequests', 'No pending sent requests')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('contacts.sentRequestsWillAppear', 'Contact requests you send to existing users will appear here')}
            </Typography>
          </Box>
        ) : (
          <List>
            {sentRequests.filter(req => !req.isInvitation).map((request) => {
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
                          {request.toEmail}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography component="span" variant="body2" color="text.primary">
                          {t('contacts.status', 'Status')}: 
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
                              {t('contacts.message', 'Message')}: "{request.message}"
                            </Typography>
                          </>
                        )}
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                          <Schedule sx={{ fontSize: 16, mr: 0.5 }} />
                          {t('contacts.sent', 'Sent {{date}}', { date: formatDate(request.createdAt) })}
                        </Typography>
                      </>
                    }
                    sx={isMobile ? { pr: 1 } : undefined}
                  />
                  {isPending && (
                    !isMobile ? (
                      <ListItemSecondaryAction>
                        <Tooltip title={t('contacts.cancelRequest', 'Cancel request')}>
                          <IconButton
                            edge="end"
                            onClick={() => handleCancelRequest(request.id!)}
                            color="error"
                          >
                            <Close />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    ) : (
                      <Box sx={{ ml: 'auto', pl: 1 }}>
                        <Tooltip title={t('contacts.cancelRequest', 'Cancel request')}>
                          <IconButton
                            size="small"
                            onClick={() => handleCancelRequest(request.id!)}
                            color="error"
                          >
                            <Close fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </TabPanel>

      {/* Sent Invitations Tab */}
      <TabPanel value={tabValue} index={3} isMobile={isMobile}>
        {sentInvitations.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Schedule sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('contacts.noPendingInvitations', 'No pending invitations')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('contacts.invitationsWillAppear', 'Invitations you send to non-registered users will appear here')}
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('contacts.invitationsToNonUsers', 'Invitations sent to non-registered users')}
              </Typography>
            </Box>
            <List>
              {sentInvitations.map((invitation) => {
                const isPending = invitation.status === 'pending';
                
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
                            {t('contacts.status', 'Status')}: 
                          </Typography>
                          {' '}
                          <Chip
                            label={invitation.status}
                            size="small"
                            color={
                              invitation.status === 'pending' ? 'warning' :
                              invitation.status === 'accepted' ? 'success' :
                              'default'
                            }
                            sx={{ ml: 1 }}
                          />
                          <br />
                          {t('contacts.sentDate', 'Sent: {{date}}', { date: formatDate(invitation.createdAt) })}
                          {invitation.message && (
                            <>
                              <br />
                              {t('contacts.message', 'Message')}: "{invitation.message}"
                            </>
                          )}
                        </>
                      }
                      sx={isMobile ? { pr: 1 } : undefined}
                    />
                    {isPending && (
                      !isMobile ? (
                        <ListItemSecondaryAction>
                          <Tooltip title={t('contacts.resendInvitation', 'Resend invitation')}>
                            <IconButton
                              edge="end"
                              onClick={() => handleResendInvitation(invitation.id!)}
                              sx={{ mr: 1 }}
                            >
                              <Email />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('contacts.cancelInvitation', 'Cancel invitation')}>
                            <IconButton
                              edge="end"
                              onClick={() => handleCancelInvitation(invitation.id!)}
                              color="error"
                            >
                              <Close />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      ) : (
                        <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto', pl: 1 }}>
                          <Tooltip title={t('contacts.resendInvitation', 'Resend invitation')}>
                            <IconButton
                              size="small"
                              onClick={() => handleResendInvitation(invitation.id!)}
                            >
                              <Email fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('contacts.cancelInvitation', 'Cancel invitation')}>
                            <IconButton
                              size="small"
                              onClick={() => handleCancelInvitation(invitation.id!)}
                              color="error"
                            >
                              <Close fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )
                    )}
                  </ListItem>
                );
              })}
            </List>
          </>
        )}
      </TabPanel>

      {/* Groups Tab */}
      <TabPanel value={tabValue} index={4} isMobile={isMobile}>
        {groups.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Group sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('contacts.noGroupsYet', 'No groups yet')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('contacts.createGroupsDescription', 'Create groups to easily share files with multiple contacts at once')}
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
                {t('contacts.createFirstGroup', 'Create Your First Group')}
              </Button>
            )}
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t('contacts.manageGroupsDescription', 'Manage your groups for easy file sharing')}
              </Typography>
              {isMobile ? (
                <Tooltip title={t('contacts.manageGroups', 'Manage Groups')}>
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
                  {t('contacts.manageGroups', 'Manage Groups')}
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
                    primary={typeof group.name === 'string' ? group.name : '[Encrypted]'}
                    secondary={
                      <>
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                          {t('contacts.membersCount', '{{count}} member', { count: Array.isArray(group.members) ? group.members.length : 0 })}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {Array.isArray(group.members) ? getMemberDisplayNames(group.members).join(', ') : t('contacts.noMembers', 'No members')}
                        </Typography>
                      </>
                    }
                    sx={isMobile ? { pr: 1 } : undefined}
                  />
                  <Box sx={{ ml: 'auto', pl: 1 }}>
                    <Tooltip title={t('contacts.manageGroup', 'Manage group')}>
                      <IconButton 
                        size={isMobile ? "small" : "medium"}
                        onClick={() => setGroupManagementOpen(true)}
                      >
                        <Edit fontSize={isMobile ? "small" : "medium"} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </TabPanel>

      {/* Add Contact Dialog */}
      <Dialog 
        open={addContactOpen} 
        onClose={() => setAddContactOpen(false)} 
        maxWidth="sm" 
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>{t('contacts.addNewContact', 'Add New Contact')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('contacts.emailAddress', 'Email Address')}
            type="email"
            fullWidth
            variant="outlined"
            value={newContactEmail}
            onChange={(e) => setNewContactEmail(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label={t('contacts.messageOptional', 'Message (optional)')}
            multiline
            rows={3}
            fullWidth
            variant="outlined"
            value={newContactMessage}
            onChange={(e) => setNewContactMessage(e.target.value)}
            placeholder={t('contacts.messagePlaceholder', "Hi! I'd like to connect with you on SeraVault to share files securely.")}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddContactOpen(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleAddContact}
            variant="contained"
            disabled={!newContactEmail.trim() || addingContact}
            startIcon={addingContact ? <CircularProgress size={16} /> : <PersonAdd />}
          >
            {addingContact ? t('contacts.sending', 'Sending...') : t('contacts.sendRequest', 'Send Request')}
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