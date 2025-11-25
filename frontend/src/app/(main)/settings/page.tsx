'use client';

import React, { useState } from 'react';
import { User, Bell, Lock, Palette, Globe, CreditCard } from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'language', label: 'Language & Region', icon: Globe },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
          <p className="text-gray-600">Manage your account and preferences</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-8">
        {/* Sidebar Tabs */}
        <div className="w-64 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary-100 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Panel */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-8">
          {activeTab === 'profile' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Profile Settings
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bio
                  </label>
                  <textarea
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Tell us about yourself..."
                  />
                </div>
                <button className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700">
                  Save Changes
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Notification Preferences
              </h2>
              <div className="space-y-4">
                {[
                  {
                    label: 'Email notifications',
                    desc: 'Receive email updates about your account',
                  },
                  {
                    label: 'Push notifications',
                    desc: 'Get push notifications on your devices',
                  },
                  {
                    label: 'Product updates',
                    desc: 'Stay informed about new features and improvements',
                  },
                  {
                    label: 'Marketing emails',
                    desc: 'Receive tips and promotional content',
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-3 border-b border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-600">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        defaultChecked
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Security Settings
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Change Password
                  </h3>
                  <div className="space-y-4">
                    <input
                      type="password"
                      placeholder="Current password"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <button className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700">
                      Update Password
                    </button>
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Two-Factor Authentication
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Add an extra layer of security to your account
                  </p>
                  <button className="border border-primary-600 text-primary-600 px-6 py-2 rounded-lg hover:bg-primary-50">
                    Enable 2FA
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Appearance
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Theme</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {['Light', 'Dark', 'System'].map((theme) => (
                      <button
                        key={theme}
                        className="border-2 border-gray-300 rounded-lg p-4 hover:border-primary-600 transition-colors"
                      >
                        <div
                          className={`h-20 rounded mb-2 ${
                            theme === 'Dark'
                              ? 'bg-gray-800'
                              : 'bg-white border border-gray-200'
                          }`}
                        ></div>
                        <p className="font-medium text-center">{theme}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'language' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Language & Region
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Language
                  </label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    <option>English (US)</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Japanese</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Timezone
                  </label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                    <option>Eastern Time (ET)</option>
                    <option>Central Time (CT)</option>
                    <option>Mountain Time (MT)</option>
                    <option>Pacific Time (PT)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Billing & Subscription
              </h2>
              <div className="space-y-6">
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Pro Plan
                      </h3>
                      <p className="text-gray-600">$49/month</p>
                    </div>
                    <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                      Active
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Next billing date: November 17, 2025
                  </p>
                  <button className="text-primary-600 font-medium text-sm hover:text-primary-700">
                    Manage Subscription
                  </button>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Payment Method
                  </h3>
                  <div className="border border-gray-300 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-8 bg-gray-200 rounded"></div>
                      <div>
                        <p className="font-medium">•••• 4242</p>
                        <p className="text-sm text-gray-600">Expires 12/26</p>
                      </div>
                    </div>
                    <button className="text-primary-600 text-sm font-medium">
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

