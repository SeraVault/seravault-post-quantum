import React from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Dashboard,
  Folder,
  InsertDriveFile,
  Description,
  Image as ImageIcon,
  Movie,
  MusicNote,
  Archive,
  Code,
  Assignment,
  Chat as ChatIcon,
  ChevronRight,
  ExpandMore,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import type { FileData } from '../files';
import {
  STANDARD_FILE_CATEGORIES,
  buildFileTypeCounts,
  type FileTypeFilterValue,
  type StandardFileCategoryId,
} from '../utils/fileTypeFilters';
import { getBuiltInFormTemplates } from '../utils/embeddedTemplates';

interface FileTypeFilterTreeProps {
  files: FileData[];
  selectedType?: FileTypeFilterValue;
  onSelectType?: (value: FileTypeFilterValue) => void;
  collapsed?: boolean;
  isMobile?: boolean;
}

interface TypeNode {
  id: FileTypeFilterValue;
  label: string;
  icon: React.ReactNode;
  count: number;
  children?: TypeNode[];
}

const standardCategoryLabels: Record<
  StandardFileCategoryId,
  { key: string; fallback: string; icon: React.ReactNode }
> = {
  documents: { key: 'navigation.fileTypes.documents', fallback: 'Documents', icon: <Description fontSize="small" /> },
  images: { key: 'navigation.fileTypes.images', fallback: 'Images', icon: <ImageIcon fontSize="small" /> },
  videos: { key: 'navigation.fileTypes.videos', fallback: 'Videos', icon: <Movie fontSize="small" /> },
  audio: { key: 'navigation.fileTypes.audio', fallback: 'Audio', icon: <MusicNote fontSize="small" /> },
  archives: { key: 'navigation.fileTypes.archives', fallback: 'Archives', icon: <Archive fontSize="small" /> },
  code: { key: 'navigation.fileTypes.code', fallback: 'Code', icon: <Code fontSize="small" /> },
  other: { key: 'navigation.fileTypes.otherFiles', fallback: 'Other Files', icon: <InsertDriveFile fontSize="small" /> },
};

const FORM_TYPE_TRANSLATION_OVERRIDES: Record<string, string> = {
  wifi: 'forms.formTypes.wifiNetwork',
  insurance: 'forms.formTypes.insurancePolicy',
  legal_document: 'forms.formTypes.legalDocument',
  will_testament: 'forms.formTypes.willTestament',
  power_of_attorney: 'forms.formTypes.powerOfAttorney',
  intellectual_property: 'forms.formTypes.intellectualProperty',
  software_license: 'forms.formTypes.softwareLicense',
  secure_note: 'forms.formTypes.secureNote',
  bank_account: 'forms.formTypes.bankAccount',
  credit_card: 'forms.formTypes.creditCard',
  medical_record: 'forms.formTypes.medicalRecord',
  crypto_wallet: 'forms.formTypes.cryptoWallet',
  vehicle_info: 'forms.formTypes.vehicleInfo',
  identity: 'forms.formTypes.identity',
  password: 'forms.formTypes.password',
  api_credentials: 'forms.formTypes.apiCredentials',
  ssh_key: 'forms.formTypes.sshKey',
  database_credentials: 'forms.formTypes.databaseCredentials',
  server_credentials: 'forms.formTypes.serverCredentials',
  vpn_credentials: 'forms.formTypes.vpnCredentials',
  encryption_keys: 'forms.formTypes.encryptionKeys',
  emergency_contacts: 'forms.formTypes.emergencyContacts',
  domain_registration: 'forms.formTypes.domainRegistration',
  two_factor_backup: 'forms.formTypes.twoFactorBackup',
  business_license: 'forms.formTypes.businessLicense',
  membership_subscription: 'forms.formTypes.membershipSubscription',
  loyalty_program: 'forms.formTypes.loyaltyProgram',
  passport: 'forms.formTypes.passport',
  travel_visa: 'forms.formTypes.travelVisa',
  frequent_flyer: 'forms.formTypes.frequentFlyer',
  professional_license: 'forms.formTypes.professionalLicense',
  education_record: 'forms.formTypes.educationRecord',
};

const toCamelCase = (value: string) =>
  value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

const toTitleCase = (value: string) =>
  value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const FileTypeFilterTree: React.FC<FileTypeFilterTreeProps> = ({
  files,
  selectedType = 'all',
  onSelectType,
  collapsed,
  isMobile,
}) => {
  const { t } = useTranslation();
  const templates = React.useMemo(() => getBuiltInFormTemplates(), []);
  const counts = React.useMemo(() => buildFileTypeCounts(files), [files]);
  const normalizedSelected = selectedType || 'all';
  const isCompact = Boolean(collapsed && !isMobile);

  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>({
    files: false,
    forms: false,
  });

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleSelection = (value: FileTypeFilterValue) => {
    if (value === normalizedSelected && value !== 'all') {
      onSelectType?.('all');
      return;
    }
    onSelectType?.(value);
  };

  const standardChildren: TypeNode[] = React.useMemo(() => {
    return STANDARD_FILE_CATEGORIES.map((category) => {
      const nodeId = `files:${category}` as FileTypeFilterValue;
      return {
        id: nodeId,
        label: t(standardCategoryLabels[category].key, standardCategoryLabels[category].fallback),
        icon: standardCategoryLabels[category].icon,
        count: counts[nodeId] ?? 0,
      };
    }).filter((node) => node.count > 0);
  }, [counts, t]);

  const formChildren: TypeNode[] = React.useMemo(() => {
    const nodes: TypeNode[] = Object.entries(templates).map(([templateId, template]) => {
      const translationKey =
        FORM_TYPE_TRANSLATION_OVERRIDES[templateId] ||
        `forms.formTypes.${toCamelCase(templateId)}`;
      const label = t(
        translationKey,
        template?.name || toTitleCase(templateId)
      );

      return {
        id: `forms:${templateId}` as FileTypeFilterValue,
        label,
        icon: <Assignment fontSize="small" />,
        count: counts[`forms:${templateId}` as FileTypeFilterValue] ?? 0,
      };
    });

    if (!templates.custom) {
      nodes.push({
        id: 'forms:custom',
        label: t('forms.formTypes.custom', 'Custom Form'),
        icon: <Assignment fontSize="small" />,
        count: counts['forms:custom'] ?? 0,
      });
    }

    return nodes
      .filter((node) => node.count > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [templates, counts, t]);

  const nodes: TypeNode[] = React.useMemo(() => {
    const baseNodes: TypeNode[] = [
      {
        id: 'all',
        label: t('navigation.fileTypes.all', 'All Items'),
        icon: <Dashboard fontSize="small" />,
        count: counts.all,
      },
      {
        id: 'files',
        label: t('navigation.fileTypes.files', 'Files'),
        icon: <Folder fontSize="small" />,
        count: counts.files,
        children: standardChildren,
      },
      {
        id: 'forms',
        label: t('navigation.fileTypes.forms', 'Forms'),
        icon: <Assignment fontSize="small" />,
        count: counts.forms,
        children: formChildren,
      },
      {
        id: 'chats',
        label: t('navigation.fileTypes.chats', 'Chats'),
        icon: <ChatIcon fontSize="small" />,
        count: counts.chats,
      },
    ];

    return baseNodes.filter((node) => {
      if (node.id === 'all') {
        return true;
      }
      if (node.id === 'files' || node.id === 'forms' || node.id === 'chats') {
        return node.count > 0;
      }
      return node.count > 0;
    });
  }, [counts, formChildren, standardChildren, t]);

  const availableTypeIds = React.useMemo(() => {
    const ids = new Set<FileTypeFilterValue>();
    nodes.forEach((node) => {
      ids.add(node.id);
      node.children?.forEach((child) => ids.add(child.id));
    });
    return ids;
  }, [nodes]);

  React.useEffect(() => {
    if (!onSelectType || normalizedSelected === 'all') {
      return;
    }
    if (!availableTypeIds.has(normalizedSelected)) {
      onSelectType('all');
    }
  }, [availableTypeIds, normalizedSelected, onSelectType]);

  const renderNode = (node: TypeNode, level = 0) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = expandedNodes[node.id] ?? false;
    const isSelected = normalizedSelected === node.id;
    const disabled = node.id !== 'all' && node.count === 0;

    const listItem = (
      <ListItemButton
        key={node.id}
        disabled={disabled}
        selected={isSelected}
        onClick={() => handleSelection(node.id)}
        sx={{
          borderRadius: 1,
          mx: 1,
          mb: 0.5,
          pl: (isCompact ? 1 : 1.5) + level * 1.5,
          minHeight: 36,
          justifyContent: isCompact ? 'center' : 'flex-start',
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              toggleNode(node.id);
            }}
            sx={{ mr: 0.5, width: 24, height: 24 }}
          >
            {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 24, mr: 0.5 }} />
        )}
        <ListItemIcon sx={{ minWidth: isCompact ? 24 : 32 }}>
          {node.icon}
        </ListItemIcon>
        {!isCompact && (
          <ListItemText
            primary={node.label}
            primaryTypographyProps={{ fontSize: 14 }}
          />
        )}
        {!isCompact && (
          <Chip
            label={node.count}
            size="small"
            color={isSelected ? 'primary' : 'default'}
            sx={{ ml: 1 }}
          />
        )}
      </ListItemButton>
    );

    const buttonWithTooltip = isCompact ? (
      <Tooltip title={node.label} placement="right">
        <Box component="span" sx={{ width: '100%', display: 'block' }}>
          {listItem}
        </Box>
      </Tooltip>
    ) : (
      listItem
    );

    return (
      <Box key={node.id}>
        {buttonWithTooltip}
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List disablePadding dense>
              {node.children!.map((child) => renderNode(child, level + 1))}
            </List>
          </Collapse>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ mt: 1 }}>
      <List disablePadding dense>
        {nodes.map((node) => renderNode(node))}
      </List>
    </Box>
  );
};

export default FileTypeFilterTree;
