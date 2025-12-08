'use client';

import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Users, User, Plus, X, Check } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import * as courseClient from '@/lib/courseClient';

interface FolderNode {
  id: string;
  name: string;
  type?: 'library' | 'team' | 'personal' | 'folder';
  children?: FolderNode[];
  depth?: number;
}

interface FolderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folderId: string, folderName: string) => void;
  selectedFolder?: string;
}

const MAX_FOLDER_DEPTH = 3;

export default function FolderSelectionModal({
  isOpen,
  onClose,
  onSelect,
  selectedFolder
}: FolderSelectionModalProps) {
  const [folderStructure, setFolderStructure] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['library', 'team', 'personal'])
  );

  // Folder creation state
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Calculate folder depth from root
  const calculateDepths = (folders: FolderNode[], depth: number = 1): FolderNode[] => {
    return folders.map(folder => ({
      ...folder,
      depth,
      children: folder.children ? calculateDepths(folder.children, depth + 1) : undefined
    }));
  };

  // Load folder structure from connect-rpc API
  const loadFolders = async () => {
    try {
      setLoading(true);
      const folders = await courseClient.getFolderHierarchy(false);
      // Convert proto folders to local format with depth calculation
      const convertedFolders = folders.map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type === 1 ? 'library' : f.type === 2 ? 'team' : f.type === 3 ? 'personal' : 'folder',
        children: f.children?.map((c: any) => convertFolder(c)),
      }));
      setFolderStructure(calculateDepths(convertedFolders as FolderNode[]));
    } catch (error) {
      console.error('Error loading folders:', error);
    } finally {
      setLoading(false);
    }
  };

  const convertFolder = (f: any): FolderNode => ({
    id: f.id,
    name: f.name,
    type: f.type === 1 ? 'library' : f.type === 2 ? 'team' : f.type === 3 ? 'personal' : 'folder',
    children: f.children?.map((c: any) => convertFolder(c)),
  });

  useEffect(() => {
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen]);

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleSelect = (folder: FolderNode) => {
    onSelect(folder.id, folder.name);
    onClose();
  };

  const handleStartCreateFolder = (parentId: string) => {
    setCreatingFolderIn(parentId);
    setNewFolderName('');
    setCreateError(null);
    // Expand the parent folder
    setExpandedFolders(prev => new Set([...prev, parentId]));
  };

  const handleCancelCreateFolder = () => {
    setCreatingFolderIn(null);
    setNewFolderName('');
    setCreateError(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !creatingFolderIn) return;

    try {
      setIsCreating(true);
      setCreateError(null);
      await courseClient.createFolder(newFolderName.trim(), creatingFolderIn);
      // Reload folders to show the new one
      await loadFolders();
      setCreatingFolderIn(null);
      setNewFolderName('');
    } catch (error: any) {
      console.error('Error creating folder:', error);
      setCreateError(error.message || 'Failed to create folder');
    } finally {
      setIsCreating(false);
    }
  };

  const renderFolderNode = (node: FolderNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedFolder === node.name;
    const currentDepth = node.depth || (level + 1);
    const canCreateSubfolder = currentDepth < MAX_FOLDER_DEPTH;
    const isCreatingHere = creatingFolderIn === node.id;

    const getIcon = () => {
      if (node.type === 'team') return <Users className="w-5 h-5 text-blue-600" />;
      if (node.type === 'personal') return <User className="w-5 h-5 text-green-600" />;
      if (isExpanded) return <FolderOpen className="w-5 h-5 text-yellow-600" />;
      return <Folder className="w-5 h-5 text-gray-600" />;
    };

    return (
      <div key={node.id}>
        <div
          className={`
            group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer min-h-[44px]
            hover:bg-hover transition-colors
            ${isSelected ? 'bg-primary-100 dark:bg-primary-900/30 border border-primary-300' : ''}
          `}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleFolder(node.id);
            }
            if (node.type === 'folder' || !hasChildren) {
              handleSelect(node);
            }
          }}
        >
          {hasChildren || isCreatingHere ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node.id);
              }}
              className="p-0.5 hover:bg-active rounded min-w-[24px] min-h-[24px] flex items-center justify-center"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted" />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}

          {getIcon()}

          <span className={`
            flex-1 font-medium
            ${node.type === 'team' || node.type === 'personal' ? 'text-primary font-semibold' : 'text-secondary'}
          `}>
            {node.name}
          </span>

          {/* New Folder button - only show if depth allows */}
          {canCreateSubfolder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStartCreateFolder(node.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-active rounded transition-opacity min-w-[24px] min-h-[24px] flex items-center justify-center"
              title="Create subfolder"
            >
              <Plus className="w-4 h-4 text-muted" />
            </button>
          )}
        </div>

        {/* Children and new folder input */}
        {(hasChildren || isCreatingHere) && isExpanded && (
          <div>
            {node.children?.map((child) => renderFolderNode(child, level + 1))}

            {/* New folder input row */}
            {isCreatingHere && (
              <div
                className="flex items-center gap-2 px-3 py-2 min-h-[44px]"
                style={{ paddingLeft: `${(level + 1) * 20 + 12}px` }}
              >
                <div className="w-5" />
                <Folder className="w-5 h-5 text-muted" />
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderName.trim()) {
                      handleCreateFolder();
                    } else if (e.key === 'Escape') {
                      handleCancelCreateFolder();
                    }
                  }}
                  placeholder="New folder name"
                  className="flex-1 px-2 py-2 text-sm border bg-surface text-primary rounded focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[36px] placeholder:text-muted"
                  autoFocus
                  disabled={isCreating}
                />
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || isCreating}
                  className="p-1 hover:bg-green-100 dark:hover:bg-green-900/20 rounded text-green-600 dark:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed min-w-[24px] min-h-[24px] flex items-center justify-center"
                  title="Create folder"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancelCreateFolder}
                  disabled={isCreating}
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-600 dark:text-red-400 min-w-[24px] min-h-[24px] flex items-center justify-center"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Error message */}
            {isCreatingHere && createError && (
              <div
                className="flex items-center gap-2 px-3 py-1 text-sm text-red-600 dark:text-red-400"
                style={{ paddingLeft: `${(level + 1) * 20 + 12 + 28}px` }}
              >
                {createError}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose Destination Folder"
      size="lg"
    >
      <div className="flex flex-col h-full">
        {/* Loading State */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-secondary">Loading folders...</div>
          </div>
        ) : (
          <>
            {/* Info text */}
            <p className="text-sm text-secondary mb-4">
              Select a folder or create a new one (max {MAX_FOLDER_DEPTH} levels deep). Hover over a folder to see the create option.
            </p>

            {/* Folder Tree */}
            <div className="flex-1 overflow-y-auto -mx-4 px-4 lg:mx-0 lg:px-0">
              <div className="space-y-1">
                {folderStructure.map((node) => renderFolderNode(node))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-4 pt-4 border-t border">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-3 lg:py-2 text-primary bg-hover rounded-lg hover:bg-active transition-colors font-medium min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedFolder) {
                    onClose();
                  }
                }}
                disabled={!selectedFolder}
                className="w-full sm:w-auto px-4 py-3 lg:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                Select Folder
              </button>
            </div>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
