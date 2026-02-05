'use client';

import React from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Users, User, Plus, Check, X, Trash2, MoreVertical } from 'lucide-react';
import { FolderType, type Folder as FolderNode } from '@/hooks/useCourses';

const MAX_FOLDER_DEPTH = 3;

export interface FolderTreeNodeProps {
  folder: FolderNode;
  level?: number;
  selectedFolderId: string | null;
  expandedFolders: Set<string>;
  creatingFolderIn: string | null;
  newFolderName: string;
  isCreating: boolean;
  createError: string | null;
  showFolderMenu: string | null;
  onToggleFolder: (id: string) => void;
  onFolderClick: (id: string) => void;
  onStartCreateFolder: (parentId: string, e: React.MouseEvent) => void;
  onCancelCreateFolder: () => void;
  onCreateFolder: () => void;
  onNewFolderNameChange: (name: string) => void;
  onShowFolderMenu: (id: string | null) => void;
  onDeleteFolder: (folder: { id: string; name: string; type: FolderType | string }) => void;
}

export function FolderTreeNode({
  folder,
  level = 0,
  selectedFolderId,
  expandedFolders,
  creatingFolderIn,
  newFolderName,
  isCreating,
  createError,
  showFolderMenu,
  onToggleFolder,
  onFolderClick,
  onStartCreateFolder,
  onCancelCreateFolder,
  onCreateFolder,
  onNewFolderNameChange,
  onShowFolderMenu,
  onDeleteFolder,
}: FolderTreeNodeProps) {
  const isExpanded = expandedFolders.has(folder.id);
  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = selectedFolderId === folder.id;
  const currentDepth = level + 1;
  const canCreateSubfolder = currentDepth < MAX_FOLDER_DEPTH;
  const isCreatingHere = creatingFolderIn === folder.id;

  // Check if folder can be deleted (only user-created folders, not system folders)
  const canDelete = folder.type !== FolderType.LIBRARY &&
    folder.type !== FolderType.PERSONAL &&
    folder.type !== FolderType.TEAM;

  const getIcon = () => {
    if (folder.type === FolderType.LIBRARY) return <FolderOpen className="w-5 h-5 text-purple-600" />;
    if (folder.type === FolderType.TEAM) return <Users className="w-5 h-5 text-blue-600" />;
    if (folder.type === FolderType.PERSONAL) return <User className="w-5 h-5 text-green-600" />;
    if (isExpanded) return <FolderOpen className="w-5 h-5 text-yellow-600" />;
    return <Folder className="w-5 h-5 text-gray-600" />;
  };

  return (
    <div key={folder.id}>
      <div
        className={`
          group flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors
          ${isSelected ? 'bg-white dark:bg-dark-surface shadow-sm dark:shadow-glow-sm' : 'hover:bg-primary-100 dark:hover:bg-primary-900/20'}
        `}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => {
          if (hasChildren) {
            onToggleFolder(folder.id);
          }
          onFolderClick(folder.id);
        }}
      >
        {(hasChildren || isCreatingHere) && (
          <button
            className="p-1 -ml-1 text-gray-600 dark:text-gray-400 min-w-[32px] min-h-[32px] flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFolder(folder.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
        {!hasChildren && !isCreatingHere && <div className="w-8" />}
        {getIcon()}
        <span className="font-medium text-gray-900 dark:text-white flex-1">{folder.name}</span>
        {folder.courseCount !== undefined && folder.courseCount > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-dark-50 px-2 py-0.5 rounded-full">
            {folder.courseCount}
          </span>
        )}
        {/* New Folder button - only show if depth allows */}
        {canCreateSubfolder && (
          <button
            onClick={(e) => onStartCreateFolder(folder.id, e)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-primary-200 dark:hover:bg-primary-900/30 rounded transition-opacity"
            title="Create subfolder"
          >
            <Plus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}

        {/* Three-dot menu for deletable folders */}
        {canDelete && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowFolderMenu(showFolderMenu === folder.id ? null : folder.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-dark-50 rounded transition-opacity"
              title="Folder options"
            >
              <MoreVertical className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>

            {/* Dropdown menu */}
            {showFolderMenu === folder.id && (
              <div className="absolute right-0 top-8 z-20 bg-white dark:bg-dark-surface-elevated border border-gray-200 dark:border-dark-border rounded-lg shadow-lg dark:shadow-dark-lg py-1 min-w-[120px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowFolderMenu(null);
                    onDeleteFolder({ id: folder.id, name: folder.name, type: folder.type || 'folder' });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children and new folder input */}
      {(hasChildren || isCreatingHere) && isExpanded && (
        <div>
          {folder.children?.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              creatingFolderIn={creatingFolderIn}
              newFolderName={newFolderName}
              isCreating={isCreating}
              createError={createError}
              showFolderMenu={showFolderMenu}
              onToggleFolder={onToggleFolder}
              onFolderClick={onFolderClick}
              onStartCreateFolder={onStartCreateFolder}
              onCancelCreateFolder={onCancelCreateFolder}
              onCreateFolder={onCreateFolder}
              onNewFolderNameChange={onNewFolderNameChange}
              onShowFolderMenu={onShowFolderMenu}
              onDeleteFolder={onDeleteFolder}
            />
          ))}

          {/* New folder input row */}
          {isCreatingHere && (
            <div
              className="flex items-center gap-2 py-2 px-3"
              style={{ paddingLeft: `${(level + 1) * 20 + 12}px` }}
            >
              <div className="w-8" />
              <Folder className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => onNewFolderNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    onCreateFolder();
                  } else if (e.key === 'Escape') {
                    onCancelCreateFolder();
                  }
                }}
                placeholder="New folder name"
                className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                  bg-white dark:bg-dark-400
                  border-gray-300 dark:border-dark-border
                  text-gray-900 dark:text-white
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
                autoFocus
                disabled={isCreating}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateFolder();
                }}
                disabled={!newFolderName.trim() || isCreating}
                className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600 dark:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Create folder"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelCreateFolder();
                }}
                disabled={isCreating}
                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600 dark:text-red-400"
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
              style={{ paddingLeft: `${(level + 1) * 20 + 12 + 32}px` }}
            >
              {createError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
