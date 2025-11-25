'use client';

import React, { useState } from 'react';
import { Folder, File, MoreVertical, Plus, Search, Grid, List } from 'lucide-react';

export default function TeamFolder1Page() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const folders = [
    { id: 1, name: 'Q4 Campaigns', items: 12, updated: '2 days ago' },
    { id: 2, name: 'Social Media', items: 24, updated: '1 week ago' },
    { id: 3, name: 'Email Templates', items: 8, updated: '3 days ago' },
  ];

  const files = [
    { id: 1, name: 'Product Launch Strategy.doc', size: '2.4 MB', updated: '1 hour ago' },
    { id: 2, name: 'Brand Guidelines.pdf', size: '5.1 MB', updated: '3 hours ago' },
    { id: 3, name: 'Marketing Plan Q4.doc', size: '1.8 MB', updated: '1 day ago' },
    { id: 4, name: 'Campaign Assets.zip', size: '15.2 MB', updated: '2 days ago' },
    { id: 5, name: 'Content Calendar.xlsx', size: '892 KB', updated: '5 days ago' },
  ];

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Team Folder 1</h1>
          <p className="text-gray-600">Marketing team shared workspace</p>
        </div>
        <button className="flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700">
          <Plus className="w-5 h-5" />
          New
        </button>
      </div>

      {/* Search + View Toggle */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search files and folders..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'grid'
                ? 'bg-primary-100 text-primary-600'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Grid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'list'
                ? 'bg-primary-100 text-primary-600'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Folders */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Folders</h2>
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4'
              : 'space-y-2'
          }
        >
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                viewMode === 'list' ? 'flex items-center justify-between' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Folder className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{folder.name}</h3>
                  <p className="text-sm text-gray-500">
                    {folder.items} items • {folder.updated}
                  </p>
                </div>
              </div>
              {viewMode === 'list' && (
                <button className="p-2 hover:bg-gray-100 rounded-lg">
                  <MoreVertical className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Files */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Files</h2>
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4'
              : 'space-y-2'
          }
        >
          {files.map((file) => (
            <div
              key={file.id}
              className={`bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                viewMode === 'list' ? 'flex items-center justify-between' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <File className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">{file.name}</h3>
                  <p className="text-xs text-gray-500">
                    {file.size} • {file.updated}
                  </p>
                </div>
              </div>
              {viewMode === 'list' && (
                <button className="p-2 hover:bg-gray-100 rounded-lg">
                  <MoreVertical className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

