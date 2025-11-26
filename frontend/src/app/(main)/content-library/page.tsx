'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Search, FileText, Users, User, Edit2, Eye, Filter, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useGetFoldersQuery, useGetCoursesQuery, FolderNode, LibraryEntry } from '@/store/api/apiSlice';
import { useIsMobile } from '@/hooks/useBreakpoint';
import { BottomSheet } from '@/components/ui/BottomSheet';

export default function ContentLibrary() {
  const router = useRouter();
  const isMobile = useIsMobile();

  // RTK Query - automatically fetches and caches data
  const { data: folders = [], isLoading: foldersLoading } = useGetFoldersQuery(true);
  const { data: courses = [], isLoading: coursesLoading } = useGetCoursesQuery();

  // Local UI state only
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['library', 'team', 'personal']));
  const [searchQuery, setSearchQuery] = useState('');
  const [folderFilteredCourses, setFolderFilteredCourses] = useState<LibraryEntry[] | null>(null);
  const [isFolderSheetOpen, setIsFolderSheetOpen] = useState(false);

  // Load courses for selected folder
  useEffect(() => {
    const loadFolderCourses = async () => {
      if (!selectedFolderId) {
        setFolderFilteredCourses(null);
        return;
      }

      try {
        const response = await fetch(`/api/library?folder=${selectedFolderId}&includeSubfolders=true`);
        if (response.ok) {
          const result = await response.json();
          setFolderFilteredCourses(result.data.courses);
        }
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
    router.push(`/course-builder?id=${courseId}&step=4`);
  };

  const renderFolder = (folder: FolderNode, level = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const hasChildren = folder.children && folder.children.length > 0;
    const isSelected = selectedFolderId === folder.id;

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
            flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors
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
          {hasChildren && (
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
          {getIcon()}
          <span className="font-medium text-gray-900 flex-1">{folder.name}</span>
          {folder.courseCount !== undefined && folder.courseCount > 0 && (
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {folder.courseCount}
            </span>
          )}
        </div>

        {isExpanded &&
          hasChildren &&
          folder.children!.map((child) => renderFolder(child, level + 1))}
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
      {foldersLoading ? (
        <div className="text-center text-gray-600 py-4">Loading folders...</div>
      ) : (
        folders.map((folder) => renderFolder(folder))
      )}
    </div>
  );

  return (
    <>
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
                        router.push(`/course-builder?id=${course.id}&step=5`);
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
    </>
  );
}