'use client';

import React, { useState, useCallback, memo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { setCourseField } from '@/store/slices/courseSlice';
import { createSelector } from '@reduxjs/toolkit';
import FolderSelectionModal from './FolderSelectionModal';
import TagsSelectionModal from './TagsSelectionModal';
import DataSourceModal from './DataSourceModal';
import { Folder, Plus, X, Hash, Database, Info } from 'lucide-react';
import * as courseClient from '@/lib/courseClient';

// Create memoized selectors to prevent unnecessary re-renders
// Use a constant for empty arrays to maintain referential equality
const EMPTY_ARRAY: string[] = [];

const selectCourseTitle = (state: RootState) => state.course.currentCourse.title || '';
const selectCourseOutcome = (state: RootState) => state.course.currentCourse.desiredOutcome || '';
const selectCourseFolder = (state: RootState) => state.course.currentCourse.destinationFolder || '';
const selectCourseTags = (state: RootState) => state.course.currentCourse.categoryTags || EMPTY_ARRAY;
const selectCourseDataSource = (state: RootState) => state.course.currentCourse.dataSource || '';

// Optimized form field component that only re-renders when its specific value changes
const FormField = memo(({
  fieldName,
  label,
  placeholder,
  type = 'text',
  rows = 3,
  selector,
}: {
  fieldName: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'textarea';
  rows?: number;
  selector: (state: RootState) => any;
}) => {
  const dispatch = useDispatch();
  const value = useSelector(selector);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dispatch(setCourseField({ field: fieldName, value: e.target.value }));
    },
    [dispatch, fieldName]
  );

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        />
      )}
    </div>
  );
});

FormField.displayName = 'FormField';

// Memoized components for folder, tags, and data source sections
const FolderSection = memo(() => {
  const dispatch = useDispatch();
  const destinationFolder = useSelector(selectCourseFolder);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState<string>('');

  // Load folder name from ID
  useEffect(() => {
    const loadFolderName = async () => {
      if (destinationFolder && destinationFolder.includes('-')) {
        // This looks like a folder ID, fetch the name
        try {
          const folders = await courseClient.getFolderHierarchy(false);
          const findFolder = (folderList: any[], id: string): string | null => {
            for (const folder of folderList) {
              if (folder.id === id) return folder.name;
              if (folder.children) {
                const found = findFolder(folder.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          const name = findFolder(folders, destinationFolder);
          if (name) setFolderName(name);
        } catch (error) {
          console.error('Failed to load folder name:', error);
        }
      } else {
        // It's already a name
        setFolderName(destinationFolder || '');
      }
    };
    loadFolderName();
  }, [destinationFolder]);

  const handleFolderSelect = useCallback((folderId: string, folderName: string) => {
    // Store the folder ID for backend
    dispatch(setCourseField({ field: 'destinationFolder', value: folderId }));
    // Store the name for display
    setFolderName(folderName);
  }, [dispatch]);

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Destination Folder
        </label>
        <button
          type="button"
          onClick={() => setIsFolderModalOpen(true)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-left"
        >
          <Folder className="w-4 h-4 text-gray-500" />
          <span className={folderName ? 'text-gray-900' : 'text-gray-500'}>
            {folderName || 'Select folder'}
          </span>
        </button>
      </div>

      <FolderSelectionModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onSelect={handleFolderSelect}
        selectedFolder={destinationFolder}
      />
    </>
  );
});

FolderSection.displayName = 'FolderSection';

const TagsSection = memo(() => {
  const dispatch = useDispatch();
  const categoryTags = useSelector(selectCourseTags);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);

  const handleTagsChange = useCallback((tags: string[]) => {
    dispatch(setCourseField({ field: 'categoryTags', value: tags }));
  }, [dispatch]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    const updatedTags = categoryTags.filter(tag => tag !== tagToRemove);
    dispatch(setCourseField({ field: 'categoryTags', value: updatedTags }));
  }, [categoryTags, dispatch]);

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Category Tags
        </label>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setIsTagsModalOpen(true)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-left"
          >
            <Hash className="w-4 h-4 text-gray-500" />
            <span className="text-gray-500">
              {categoryTags.length > 0 ? 'Add more tags' : 'Select tags'}
            </span>
          </button>
          {categoryTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categoryTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:bg-primary-200 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <TagsSelectionModal
        isOpen={isTagsModalOpen}
        onClose={() => setIsTagsModalOpen(false)}
        selectedTags={categoryTags}
        onTagsChange={handleTagsChange}
      />
    </>
  );
});

TagsSection.displayName = 'TagsSection';

const DataSourceSection = memo(() => {
  const dispatch = useDispatch();
  const dataSource = useSelector(selectCourseDataSource);
  const [isDataSourceModalOpen, setIsDataSourceModalOpen] = useState(false);

  const handleDataSourceSelect = useCallback((source: string) => {
    dispatch(setCourseField({ field: 'dataSource', value: source }));
  }, [dispatch]);

  const getDataSourceDisplay = (sourceId: string | undefined) => {
    const sourceNames: { [key: string]: string } = {
      'open-web': 'Open Web Search',
      'curated-web': 'Curated Web Sources',
      'pdf-upload': 'PDF Documents',
      'video-upload': 'Video Content',
      'document-upload': 'Office Documents',
      'google-drive': 'Google Drive',
      'sharepoint': 'SharePoint',
      'confluence': 'Confluence',
      'local-storage': 'Local Knowledge Base'
    };
    return sourceId ? sourceNames[sourceId] || sourceId : null;
  };

  const displayText = getDataSourceDisplay(dataSource);

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Data Source
        </label>
        <button
          type="button"
          onClick={() => setIsDataSourceModalOpen(true)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-left"
        >
          <Database className="w-4 h-4 text-gray-500" />
          <span className={displayText ? 'text-gray-900' : 'text-gray-500'}>
            {displayText || 'Select data source'}
          </span>
        </button>
      </div>

      <DataSourceModal
        isOpen={isDataSourceModalOpen}
        onClose={() => setIsDataSourceModalOpen(false)}
        selectedSource={dataSource}
        onSourceSelect={handleDataSourceSelect}
      />
    </>
  );
});

DataSourceSection.displayName = 'DataSourceSection';

// Main CourseForm component - now optimized with proper memoization
function CourseForm() {
  return (
    <div className="space-y-6">
      <FormField
        fieldName="title"
        label="Course Title"
        placeholder="eg: Objection Handling and Discovery Best Practices"
        selector={selectCourseTitle}
      />

      <FormField
        fieldName="desiredOutcome"
        label="Learning Goal"
        placeholder="Describe the learning goal and desired outcomes for this course"
        type="textarea"
        rows={3}
        selector={selectCourseOutcome}
      />

      <FolderSection />
      <TagsSection />
      <DataSourceSection />
    </div>
  );
}

// Wrap the entire form in memo to prevent unnecessary re-renders from parent
export default memo(CourseForm);