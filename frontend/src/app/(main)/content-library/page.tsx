'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Search, FileText, Users, User, Edit2, Eye, Filter, X, Plus, Check, Trash2, MoreVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useGetFoldersQuery, useGetCoursesQuery, type LibraryEntry, type FolderNode } from '@/store/api/apiSlice';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AIGenerationFlowModal } from '@/components/ai-generation';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import * as courseClient from '@/lib/courseClient';

const MAX_FOLDER_DEPTH = 3;

export default function ContentLibrary() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | undefined>(undefined);

  // Connect-query based hooks (wrapped in apiSlice)
  const { data: folders = [], isLoading: foldersLoading, refetch: refetchFolders } = useGetFoldersQuery(true);
  const { data: courses = [], isLoading: coursesLoading } = useGetCoursesQuery();

  // Local UI state only
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['library', 'team', 'personal']));
  const [searchQuery, setSearchQuery] = useState('');
  const [folderFilteredCourses, setFolderFilteredCourses] = useState<LibraryEntry[] | null>(null);
  const [isFolderSheetOpen, setIsFolderSheetOpen] = useState(false);

  // Folder creation state
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Folder delete state
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string; type: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);

  // Close folder menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showFolderMenu) {
        setShowFolderMenu(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showFolderMenu]);

  // Load courses for selected folder using connect-rpc
  useEffect(() => {
    const loadFolderCourses = async () => {
      if (!selectedFolderId) {
        setFolderFilteredCourses(null);
        return;
      }

      try {
        // Use listCourses with folder filter
        const result = await courseClient.listCourses({ folder: selectedFolderId });
        // Convert proto response to frontend LibraryEntry type
        const statusMap: Record<number, 'draft' | 'published'> = {
          0: 'draft', 1: 'draft', 2: 'published', 3: 'draft',
        };
        setFolderFilteredCourses(result.map((entry: any): LibraryEntry => ({
          id: entry.id,
          title: entry.title || '',
          status: statusMap[entry.status as number] || 'draft',
          folder: entry.folder || '',
          tags: entry.tags || [],
          createdAt: entry.createdAt || new Date().toISOString(),
          modifiedAt: entry.modifiedAt || new Date().toISOString(),
          createdBy: entry.createdBy,
          thumbnailPath: entry.thumbnailPath,
        })));
      } catch (error) {
        console.error('Failed to load folder courses:', error);
      }
    };

    loadFolderCourses();
  }, [selectedFolderId]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const handleFolderClick = (folderId: string) => {
    setSelectedFolderId(folderId);
    // Close folder sheet on mobile after selection
    if (isMobile) {
      setTimeout(() => setIsFolderSheetOpen(false), 150);
    }
  };

  // Get selected folder name for mobile display
  const getSelectedFolderName = (): string => {
    if (!selectedFolderId) return 'All Courses';
    const findFolder = (folderList: FolderNode[]): string | null => {
      for (const folder of folderList) {
        if (folder.id === selectedFolderId) return folder.name;
        if (folder.children) {
          const found = findFolder(folder.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findFolder(folders) || 'All Courses';
  };

  const handleCourseClick = (courseId: string) => {
    setEditingCourseId(courseId);
    setIsAIModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAIModalOpen(false);
    setEditingCourseId(undefined);
  };

  // Folder creation handlers
  const handleStartCreateFolder = (parentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
      // Refetch folders to show the new one
      await refetchFolders();
      setCreatingFolderIn(null);
      setNewFolderName('');
    } catch (error: any) {
      console.error('Error creating folder:', error);
      setCreateError(error.message || 'Failed to create folder');
    } finally {
      setIsCreating(false);
    }
  };

  // Folder delete handlers
  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;

    try {
      setIsDeleting(true);
      setDeleteError(null);
      await courseClient.deleteFolder(folderToDelete.id);
      // Refetch folders to reflect deletion
      await refetchFolders();
      setFolderToDelete(null);
      // Clear selection if deleted folder was selected
      if (selectedFolderId === folderToDelete.id) {
        setSelectedFolderId(null);
      }
    } catch (error: any) {
      console.error('Error deleting folder:', error);
      setDeleteError(error.message || 'Failed to delete folder. Make sure the folder is empty.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setFolderToDelete(null);
    setDeleteError(null);
  };

  // Check if folder can be deleted (only user-created folders, not system folders)
  const canDeleteFolder = (folder: FolderNode): boolean => {
    // Can't delete system folders (Shared, Private, Team root folders)
    if (folder.type === 'library' || folder.type === 'personal' || folder.type === 'team') {
      return false;
    }
    return true;
  };

  // Calculate folder depth
  const getFolderDepth = (folderId: string, folderList: FolderNode[], depth: number = 1): number => {
    for (const folder of folderList) {
      if (folder.id === folderId) return depth;
      if (folder.children) {
        const found = getFolderDepth(folderId, folder.children, depth + 1);
        if (found > 0) return found;
      }
    }
    return 0;
  };

  const renderFolder = (folder: FolderNode, level = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const hasChildren = folder.children && folder.children.length > 0;
    const isSelected = selectedFolderId === folder.id;
    const currentDepth = level + 1;
    const canCreateSubfolder = currentDepth < MAX_FOLDER_DEPTH;
    const isCreatingHere = creatingFolderIn === folder.id;

    const getIcon = () => {
      if (folder.type === 'library') return <FolderOpen className="w-5 h-5 text-purple-600" />;
      if (folder.type === 'team') return <Users className="w-5 h-5 text-blue-600" />;
      if (folder.type === 'personal') return <User className="w-5 h-5 text-green-600" />;
      if (isExpanded) return <FolderOpen className="w-5 h-5 text-yellow-600" />;
      return <Folder className="w-5 h-5 text-gray-600" />;
    };

    return (
      <div key={folder.id}>
        <div
          className={`
            group flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors
            ${isSelected ? 'bg-white shadow-sm' : 'hover:bg-primary-100'}
          `}
          style={{ paddingLeft: `${level * 20 + 12}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleFolder(folder.id);
            }
            handleFolderClick(folder.id);
          }}
        >
          {(hasChildren || isCreatingHere) && (
            <button
              className="p-1 -ml-1 text-gray-600 min-w-[32px] min-h-[32px] flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id);
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
          <span className="font-medium text-gray-900 flex-1">{folder.name}</span>
          {folder.courseCount !== undefined && folder.courseCount > 0 && (
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {folder.courseCount}
            </span>
          )}
          {/* New Folder button - only show if depth allows */}
          {canCreateSubfolder && (
            <button
              onClick={(e) => handleStartCreateFolder(folder.id, e)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-primary-200 rounded transition-opacity"
              title="Create subfolder"
            >
              <Plus className="w-4 h-4 text-gray-500" />
            </button>
          )}

          {/* Three-dot menu for deletable folders */}
          {canDeleteFolder(folder) && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFolderMenu(showFolderMenu === folder.id ? null : folder.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
                title="Folder options"
              >
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </button>

              {/* Dropdown menu */}
              {showFolderMenu === folder.id && (
                <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFolderMenu(null);
                      setFolderToDelete({ id: folder.id, name: folder.name, type: folder.type || 'folder' });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
            {folder.children?.map((child) => renderFolder(child, level + 1))}

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
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderName.trim()) {
                      handleCreateFolder();
                    } else if (e.key === 'Escape') {
                      handleCancelCreateFolder();
                    }
                  }}
                  placeholder="New folder name"
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  autoFocus
                  disabled={isCreating}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateFolder();
                  }}
                  disabled={!newFolderName.trim() || isCreating}
                  className="p-1 hover:bg-green-100 rounded text-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Create folder"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelCreateFolder();
                  }}
                  disabled={isCreating}
                  className="p-1 hover:bg-red-100 rounded text-red-600"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Error message */}
            {isCreatingHere && createError && (
              <div
                className="flex items-center gap-2 px-3 py-1 text-sm text-red-600"
                style={{ paddingLeft: `${(level + 1) * 20 + 12 + 32}px` }}
              >
                {createError}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Use folder-filtered courses if a folder is selected, otherwise use all courses from Redux
  const displayCourses = folderFilteredCourses || courses;

  const filteredCourses = displayCourses.filter(course => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    // Search in title
    const titleMatch = course.title.toLowerCase().includes(query);
    // Search in tags
    const tagMatch = course.tags && course.tags.some(tag =>
      tag.toLowerCase().includes(query)
    );

    return titleMatch || tagMatch;
  });

  // Folder list content (used in both desktop sidebar and mobile sheet)
  const folderListContent = (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 px-3 mb-2">
        Hover over folders to add subfolders (max {MAX_FOLDER_DEPTH} levels)
      </div>
      {foldersLoading ? (
        <div className="text-center text-gray-600 py-4">Loading folders...</div>
      ) : (
        folders.map((folder) => renderFolder(folder))
      )}
    </div>
  );

  return (
    <>
      {/* AI Generation Flow Modal */}
      <AIGenerationFlowModal
        isOpen={isAIModalOpen}
        onClose={handleCloseModal}
        courseId={editingCourseId}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1 lg:mb-2">Content Library</h1>
          <p className="text-sm lg:text-base text-gray-600">Browse and organize all your content</p>
        </div>
      </div>

      {/* Mobile: Folder filter button */}
      {isMobile && (
        <div className="mb-4">
          <button
            onClick={() => setIsFolderSheetOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-primary-50 text-primary-700 rounded-lg border border-primary-200 w-full justify-between min-h-[44px]"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span className="font-medium">{getSelectedFolderName()}</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mobile: Folder selection bottom sheet */}
      <BottomSheet
        isOpen={isFolderSheetOpen}
        onClose={() => setIsFolderSheetOpen(false)}
        title="Select Folder"
        height="half"
      >
        {folderListContent}
      </BottomSheet>

      {/* Two-column layout - stacked on mobile */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Left: Folder Sidebar (hidden on mobile - use sheet instead) */}
        <div className="hidden lg:block w-80 bg-primary-50 border border-gray-200 rounded-2xl p-4 h-[calc(100vh-200px)] overflow-y-auto">
          {folderListContent}
        </div>

        {/* Right: Main Content */}
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-4 lg:p-6">
          <div className="mb-4 lg:mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search courses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full lg:max-w-md pl-10 pr-4 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none min-h-[44px]"
              />
            </div>
          </div>

          {coursesLoading ? (
            <div className="text-center text-gray-600 py-12">Loading courses...</div>
          ) : filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCourses.map((course) => (
                <div
                  key={course.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleCourseClick(course.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 line-clamp-2">
                        {course.title || 'Untitled Course'}
                      </h3>
                    </div>
                    <FileText className="w-5 h-5 text-gray-400" />
                  </div>

                  {course.tags && course.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {course.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {course.tags.length > 3 && (
                        <span className="text-xs text-gray-500">
                          +{course.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    Modified {new Date(course.modifiedAt).toLocaleDateString()}
                  </div>

                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors min-h-[44px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCourseClick(course.id);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors min-h-[44px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/course/${course.id}/preview`);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Folder className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {selectedFolderId ? 'No courses in this folder' : 'Select a folder'}
              </h3>
              <p className="text-gray-600">
                {selectedFolderId
                  ? 'Create your first course in this folder to get started.'
                  : 'Choose a folder from the sidebar to view its contents.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Folder Confirmation Modal */}
      <ResponsiveModal
        isOpen={!!folderToDelete}
        onClose={handleCancelDelete}
        title="Delete Folder"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete the folder <strong>"{folderToDelete?.name}"</strong>?
          </p>
          <p className="text-sm text-gray-500">
            This action cannot be undone. The folder must be empty to be deleted.
          </p>

          {deleteError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {deleteError}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <button
              onClick={handleCancelDelete}
              disabled={isDeleting}
              className="flex-1 px-4 py-3 lg:py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteFolder}
              disabled={isDeleting}
              className="flex-1 px-4 py-3 lg:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete Folder
                </>
              )}
            </button>
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
