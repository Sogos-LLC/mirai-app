'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, Folder, Search, Filter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useGetFolderHierarchy, useListCourses, useCreateFolder, useDeleteFolder, useUpdateCourse, useDeleteCourse, FolderType, type Folder as FolderNode } from '@/hooks/useCourses';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FolderTreeNode } from '@/components/content-library/FolderTreeNode';
import { CourseCard } from '@/components/content-library/CourseCard';
import { DeleteFolderModal } from '@/components/content-library/DeleteFolderModal';
import { CourseDetailsModal } from '@/components/content-library/CourseDetailsModal';
import FolderSelectionModal from '@/components/course/FolderSelectionModal';

const MAX_FOLDER_DEPTH = 3;

export default function ContentLibrary() {
  const router = useRouter();
  const isMobile = useIsMobile();

  // Folder mutation hooks
  const createFolderMutation = useCreateFolder();
  const deleteFolderMutation = useDeleteFolder();
  const updateCourseMutation = useUpdateCourse();
  const deleteCourseMutation = useDeleteCourse();

  // Local UI state only
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['library', 'team', 'personal']));
  const [searchQuery, setSearchQuery] = useState('');

  // Connect-query hooks - use folder filter directly for better caching
  const { data: folders, isLoading: foldersLoading } = useGetFolderHierarchy(true);
  // Pagination state
  const [pageOffset, setPageOffset] = useState(0);
  const PAGE_SIZE = 20;
  // Fetch courses with folder filter - React Query will cache per folder automatically
  const { data: courses, isLoading: coursesLoading, hasMore } = useListCourses({
    folder: selectedFolderId || undefined,
    limit: PAGE_SIZE,
    offset: pageOffset,
  });
  const [isFolderSheetOpen, setIsFolderSheetOpen] = useState(false);

  // Course details state
  const [detailsCourseId, setDetailsCourseId] = useState<string | null>(null);

  // Move-to-folder state
  const [movingCourseId, setMovingCourseId] = useState<string | null>(null);

  // Folder creation state
  const [creatingFolderIn, setCreatingFolderIn] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Folder delete state
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string; type: FolderType | string } | null>(null);
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

  // Courses are now fetched via useListCourses with folder filter
  // React Query handles caching automatically based on the folder parameter

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const handleFolderClick = (folderId: string) => {
    setSelectedFolderId(folderId);
    setPageOffset(0);
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
    router.push(`/course/${courseId}/editor`);
  };

  const handleCoursePreview = (courseId: string) => {
    router.push(`/preview/${courseId}`);
  };

  const handleMoveToFolder = (courseId: string) => {
    setMovingCourseId(courseId);
  };

  const handleMoveCourseConfirm = async (folderId: string) => {
    if (!movingCourseId) return;
    try {
      await updateCourseMutation.mutate(movingCourseId, {
        settings: { destinationFolder: folderId },
      });
    } catch (error) {
      console.error('Failed to move course:', error);
    }
    setMovingCourseId(null);
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!confirm('Are you sure you want to delete this course?\n\nThis action cannot be undone.')) return;
    try {
      await deleteCourseMutation.mutate(courseId);
    } catch (error) {
      console.error('Failed to delete course:', error);
    }
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
      await createFolderMutation.mutate({
        name: newFolderName.trim(),
        parentId: creatingFolderIn,
      });
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
      await deleteFolderMutation.mutate(folderToDelete.id);
      setFolderToDelete(null);
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

  // Courses are already filtered by folder via React Query
  const filteredCourses = courses.filter(course => {
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

  // Shared props for FolderTreeNode instances
  const folderTreeProps = {
    selectedFolderId,
    expandedFolders,
    creatingFolderIn,
    newFolderName,
    isCreating,
    createError,
    showFolderMenu,
    onToggleFolder: toggleFolder,
    onFolderClick: handleFolderClick,
    onStartCreateFolder: handleStartCreateFolder,
    onCancelCreateFolder: handleCancelCreateFolder,
    onCreateFolder: handleCreateFolder,
    onNewFolderNameChange: setNewFolderName,
    onShowFolderMenu: setShowFolderMenu,
    onDeleteFolder: setFolderToDelete,
  };

  // Folder list content (used in both desktop sidebar and mobile sheet)
  const folderListContent = (
    <div className="space-y-1">
      <div className="text-xs text-gray-500 dark:text-gray-400 px-3 pb-3">
        Hover over folders to add subfolders (max {MAX_FOLDER_DEPTH} levels)
      </div>
      {foldersLoading ? (
        <div className="text-center text-gray-600 dark:text-gray-400 py-8">Loading folders...</div>
      ) : (
        <div className="space-y-1">
          {folders.map((folder) => (
            <FolderTreeNode
              key={folder.id}
              folder={folder}
              {...folderTreeProps}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 lg:mb-12">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-2">Content Library</h1>
          <p className="text-sm lg:text-base text-gray-600 dark:text-gray-400">Browse and organize all your content</p>
        </div>
      </div>

      {/* Mobile: Folder filter button */}
      {isMobile && (
        <div className="mb-6">
          <button
            onClick={() => setIsFolderSheetOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 rounded-lg border border-primary-200 dark:border-primary-800 w-full justify-between min-h-[44px]"
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
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Left: Folder Sidebar (hidden on mobile - use sheet instead) */}
        <div className="hidden lg:block w-80 flex-shrink-0 bg-primary-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl p-5 max-h-[calc(100vh-280px)] overflow-y-auto">
          {folderListContent}
        </div>

        {/* Right: Main Content */}
        <div className="flex-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl p-5 lg:p-8 max-h-[calc(100vh-280px)] overflow-y-auto">
          <div className="mb-6 lg:mb-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search courses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full lg:max-w-md pl-10 pr-4 py-3 lg:py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none min-h-[44px]
                  bg-white dark:bg-dark-400
                  border-gray-300 dark:border-dark-border
                  text-gray-900 dark:text-white
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          {coursesLoading ? (
            <div className="text-center text-gray-600 dark:text-gray-400 py-12">Loading courses...</div>
          ) : filteredCourses.length > 0 ? (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onEdit={handleCourseClick}
                  onPreview={handleCoursePreview}
                  onDetails={setDetailsCourseId}
                  onMoveToFolder={handleMoveToFolder}
                  onDelete={handleDeleteCourse}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setPageOffset(prev => prev + PAGE_SIZE)}
                  className="px-6 py-3 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors min-h-[44px]"
                >
                  Load more
                </button>
              </div>
            )}
            </>
          ) : (
            <div className="text-center py-16 lg:py-24">
              <Folder className="w-16 h-16 text-gray-300 dark:text-dark-text-muted mx-auto mb-6" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                {selectedFolderId ? 'No courses in this folder' : 'Select a folder'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
                {selectedFolderId
                  ? 'Create your first course in this folder to get started.'
                  : 'Choose a folder from the sidebar to view its contents.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Folder Confirmation Modal */}
      <DeleteFolderModal
        folder={folderToDelete}
        isDeleting={isDeleting}
        deleteError={deleteError}
        onConfirm={handleDeleteFolder}
        onCancel={handleCancelDelete}
      />

      {/* Move Course to Folder Modal */}
      <FolderSelectionModal
        isOpen={!!movingCourseId}
        onClose={() => setMovingCourseId(null)}
        onSelect={(folderId) => handleMoveCourseConfirm(folderId)}
      />

      {/* Course Details Modal */}
      <CourseDetailsModal
        course={filteredCourses.find(c => c.id === detailsCourseId) ?? null}
        onClose={() => setDetailsCourseId(null)}
      />
    </>
  );
}
