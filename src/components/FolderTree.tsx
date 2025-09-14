import React from 'react';
import { List, ListItemButton, ListItemText, Collapse, ListItemIcon, IconButton } from '@mui/material';
import { ChevronRight, ExpandMore, Folder, FolderOpen } from '@mui/icons-material';
import { type Folder as FolderData } from '../firestore';

interface FolderTreeProps {
  folders: FolderData[];
  onFolderClick: (folderId: string | null) => void;
  onMoveItem?: (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => void;
}

interface FolderTreeItemProps {
  folder: FolderData;
  allFolders: FolderData[];
  onFolderClick: (folderId: string | null) => void;
  onMoveItem?: (itemId: string, itemType: 'file' | 'folder', targetFolderId: string | null) => void;
  level: number;
}

const FolderTreeItem: React.FC<FolderTreeItemProps> = ({ folder, allFolders, onFolderClick, onMoveItem, level }) => {
  const [open, setOpen] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleFolderClick = () => {
    onFolderClick(folder.id || null);
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(!open);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: folder.id,
      type: 'folder',
      name: folder.name
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set dragOver to false if we're actually leaving this element
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    console.log('🎯 FolderTree drop event triggered on folder:', folder.name);
    console.log('🎯 Event dataTransfer types:', Array.from(e.dataTransfer.types));
    console.log('🎯 Raw drag data:', e.dataTransfer.getData('application/json'));
    
    try {
      const dragData = e.dataTransfer.getData('application/json');
      if (!dragData) {
        console.warn('❌ No drag data found');
        return;
      }
      
      const data = JSON.parse(dragData);
      console.log('🎯 Parsed drag data:', data);
      console.log('🎯 Target folder:', { id: folder.id, name: folder.name });
      
      // Don't allow dropping a folder into itself or its children
      if (data.type === 'folder' && (data.id === folder.id || isDescendant(data.id, folder.id!))) {
        console.warn('❌ Prevented dropping folder into itself or descendant');
        return;
      }
      
      if (onMoveItem && data.id !== folder.id) {
        console.log('✅ Calling onMoveItem with:', { itemId: data.id, itemType: data.type, targetFolderId: folder.id });
        onMoveItem(data.id, data.type, folder.id || null);
      } else {
        console.warn('❌ onMoveItem not called:', { hasHandler: !!onMoveItem, sameId: data.id === folder.id });
      }
    } catch (error) {
      console.error('❌ Error handling drop:', error);
    }
  };

  // Check if targetId is a descendant of sourceId
  const isDescendant = (sourceId: string, targetId: string): boolean => {
    const findChildren = (parentId: string): string[] => {
      const children = allFolders.filter(f => f.parent === parentId).map(f => f.id!);
      const grandchildren = children.flatMap(childId => findChildren(childId));
      return [...children, ...grandchildren];
    };
    
    const descendants = findChildren(sourceId);
    return descendants.includes(targetId);
  };

  const children = allFolders.filter((f) => f.parent === folder.id);

  return (
    <>
      <ListItemButton 
        draggable
        onClick={handleFolderClick}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{ 
          pl: level * 2,
          borderRadius: 1,
          mx: 0.5,
          mb: 0.2,
          minHeight: 32,
          cursor: 'pointer',
          backgroundColor: isDragOver ? 'primary.light' : 'transparent',
          border: isDragOver ? '2px dashed' : '2px solid transparent',
          borderColor: isDragOver ? 'primary.main' : 'transparent',
          '&:hover': {
            backgroundColor: isDragOver ? 'primary.light' : 'action.hover',
          },
          '&:active': {
            cursor: 'grabbing',
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
              onMoveItem={onMoveItem}
              level={level + 1}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
};

const FolderTree: React.FC<FolderTreeProps> = ({ folders, onFolderClick, onMoveItem }) => {
  const rootFolders = folders.filter((f) => f.parent === null);

  return (
    <List>
      {rootFolders.map((folder) => (
        <FolderTreeItem
          key={folder.id}
          folder={folder}
          allFolders={folders}
          onFolderClick={onFolderClick}
          onMoveItem={onMoveItem}
          level={1}
        />
      ))}
    </List>
  );
};

export default FolderTree;
