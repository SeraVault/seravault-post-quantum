import React from 'react';
import { List, ListItemButton, ListItemText, Collapse, ListItemIcon, IconButton } from '@mui/material';
import { ChevronRight, ExpandMore, Folder, FolderOpen } from '@mui/icons-material';
import { type Folder as FolderData } from '../firestore';

interface FolderTreeProps {
  folders: FolderData[];
  onFolderClick: (folderId: string | null) => void;
}

interface FolderTreeItemProps {
  folder: FolderData;
  allFolders: FolderData[];
  onFolderClick: (folderId: string | null) => void;
  level: number;
}

const FolderTreeItem: React.FC<FolderTreeItemProps> = ({ folder, allFolders, onFolderClick, level }) => {
  const [open, setOpen] = React.useState(false);

  const handleFolderClick = () => {
    onFolderClick(folder.id || null);
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(!open);
  };

  const children = allFolders.filter((f) => f.parent === folder.id);

  return (
    <>
      <ListItemButton 
        onClick={handleFolderClick}
        sx={{ 
          pl: level * 2,
          borderRadius: 1,
          mx: 0.5,
          mb: 0.2,
          minHeight: 32,
          '&:hover': {
            backgroundColor: 'action.hover',
          }
        }}
      >
        {children.length > 0 && (
          <IconButton
            size="small"
            onClick={handleToggleExpand}
            sx={{ 
              mr: 0.5,
              padding: '2px',
              width: 20,
              height: 20
            }}
          >
            {open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
          </IconButton>
        )}
        <ListItemIcon sx={{ minWidth: 24, ml: children.length === 0 ? 2.5 : 0 }}>
          {open ? <FolderOpen fontSize="small" /> : <Folder fontSize="small" />}
        </ListItemIcon>
        <ListItemText 
          primary={typeof folder.name === 'string' ? folder.name : '[Encrypted]'} 
          primaryTypographyProps={{ fontSize: '14px' }}
        />
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              allFolders={allFolders}
              onFolderClick={onFolderClick}
              level={level + 1}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
};

const FolderTree: React.FC<FolderTreeProps> = ({ folders, onFolderClick }) => {
  const rootFolders = folders.filter((f) => f.parent === null);

  return (
    <List>
      {rootFolders.map((folder) => (
        <FolderTreeItem
          key={folder.id}
          folder={folder}
          allFolders={folders}
          onFolderClick={onFolderClick}
          level={1}
        />
      ))}
    </List>
  );
};

export default FolderTree;
