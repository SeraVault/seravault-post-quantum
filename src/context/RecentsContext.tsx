import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export interface RecentItem {
  id: string;
  // Store only non-sensitive metadata - names will be decrypted on-demand
  type: 'file' | 'form';
  parent: string | null;
  accessedAt: string;
  // Remove sensitive fields that would expose decrypted data
}

interface RecentsContextType {
  recentItems: RecentItem[];
  addRecentItem: (item: Omit<RecentItem, 'accessedAt'>) => void;
  clearRecents: () => void;
  isRecentsView: boolean;
  setIsRecentsView: (value: boolean) => void;
  isFavoritesView: boolean;
  setIsFavoritesView: (value: boolean) => void;
  isSharedView: boolean;
  setIsSharedView: (value: boolean) => void;
}

const RecentsContext = createContext<RecentsContextType | undefined>(undefined);

export const useRecents = () => {
  const context = useContext(RecentsContext);
  if (!context) {
    throw new Error('useRecents must be used within a RecentsProvider');
  }
  return context;
};

export const RecentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [isRecentsView, setIsRecentsView] = useState(false);
  const [isFavoritesView, setIsFavoritesView] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const MAX_RECENT_ITEMS = 20;

  // Get storage key for user
  const getStorageKey = (userId: string) => `seravault_recent_items_${userId}`;

  // Load recents from localStorage on mount
  useEffect(() => {
    if (!user) {
      setRecentItems([]);
      return;
    }

    try {
      const stored = localStorage.getItem(getStorageKey(user.uid));
      if (stored) {
        const parsed: RecentItem[] = JSON.parse(stored);
        // Filter out items older than 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const validItems = parsed.filter(item => 
          new Date(item.accessedAt) > thirtyDaysAgo
        );
        
        setRecentItems(validItems);
        
        // Update storage if we filtered out old items
        if (validItems.length !== parsed.length) {
          localStorage.setItem(getStorageKey(user.uid), JSON.stringify(validItems));
        }
      }
    } catch (error) {
      console.error('Error loading recent items:', error);
      setRecentItems([]);
    }
  }, [user]);

  const addRecentItem = (newItem: Omit<RecentItem, 'accessedAt'>) => {
    if (!user) return;

    // Only store non-sensitive metadata
    const recentItem: RecentItem = {
      id: newItem.id,
      type: newItem.type,
      parent: newItem.parent,
      accessedAt: new Date().toISOString(),
    };

    setRecentItems(prev => {
      // Remove existing entry if it exists
      const filtered = prev.filter(item => item.id !== recentItem.id);
      
      // Add to beginning and limit to MAX_RECENT_ITEMS
      const updated = [recentItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
      
      // Save to localStorage
      try {
        localStorage.setItem(getStorageKey(user.uid), JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving recent items:', error);
      }
      
      return updated;
    });
  };

  const clearRecents = () => {
    if (!user) return;
    
    setRecentItems([]);
    try {
      localStorage.removeItem(getStorageKey(user.uid));
    } catch (error) {
      console.error('Error clearing recent items:', error);
    }
  };

  return (
    <RecentsContext.Provider value={{
      recentItems,
      addRecentItem,
      clearRecents,
      isRecentsView,
      setIsRecentsView,
      isFavoritesView,
      setIsFavoritesView,
      isSharedView,
      setIsSharedView,
    }}>
      {children}
    </RecentsContext.Provider>
  );
};