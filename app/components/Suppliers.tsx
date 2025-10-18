'use client';

import { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { Supplier } from '../types';
import SupplierDetailPanel from './SupplierDetailPanel';

export default function Suppliers() {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useInventory();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    country: '',
    currency: 'USD',
    notes: '',
  });

  // Column visibility state
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search dropdown state
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Get visible columns for suppliers table
  const getVisibleColumns = () => {
    const allColumns = [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'country', label: 'Country' },
      { key: 'actions', label: 'Actions' }
    ];
    return allColumns;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showColumnDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowColumnDropdown(false);
      }
      if (showSearchDropdown && searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnDropdown, showSearchDropdown]);

  // Filter suppliers based on search query
  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSupplier) {
      updateSupplier(editingSupplier.id, formData);
    } else {
      addSupplier(formData);
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', country: '', currency: 'USD', notes: '' });
    setEditingSupplier(null);
    setIsFormOpen(false);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      country: supplier.country,
      currency: supplier.currency,
      notes: supplier.notes,
    });
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Suppliers</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your jewelry suppliers</p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-5 py-2.5 rounded-lg transition-all font-medium text-sm shadow-sm hover:shadow active:scale-95"
        >
          Add Supplier
        </button>
      </div>

      {/* Column Visibility Control */}
      <div className="flex items-center justify-end gap-3">
        {/* Column Visibility Control */}
        <div className="relative">
          <button
            onClick={() => setShowColumnDropdown(!showColumnDropdown)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
          >
            <svg className={`w-4 h-4 ${hiddenColumns.size > 0 ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Hide fields</span>
            {hiddenColumns.size > 0 && (
              <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                {hiddenColumns.size}
              </span>
            )}
          </button>
          
          {showColumnDropdown && (
            <div ref={dropdownRef} className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              <div className="p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Column Visibility</div>
                <div className="grid grid-cols-2 gap-3">
                  {getVisibleColumns().map(column => (
                    <div key={column.key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{column.label}</span>
                      <button
                        onClick={() => {
                          if (hiddenColumns.has(column.key)) {
                            setHiddenColumns(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(column.key);
                              return newSet;
                            });
                          } else {
                            setHiddenColumns(prev => new Set([...prev, column.key]));
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:ring-offset-2 ${
                          hiddenColumns.has(column.key) ? 'bg-gray-300' : 'bg-[#4f0c1b]'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            hiddenColumns.has(column.key) ? 'translate-x-1' : 'translate-x-6'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Search Button */}
        <div className="relative">
          <button
            onClick={() => setShowSearchDropdown(!showSearchDropdown)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          
          {showSearchDropdown && (
            <div ref={searchDropdownRef} className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
              <div className="p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Search</div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search suppliers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                  <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-8rem)] p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="supplier@email.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Country</label>
                  <select
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  >
                    <option value="">Select country</option>
                    <option value="USA">🇺🇸 USA</option>
                    <option value="Ecuador">🇪🇨 Ecuador</option>
                    <option value="Colombia">🇨🇴 Colombia</option>
                    <option value="Brazil">🇧🇷 Brazil</option>
                    <option value="China">🇨🇳 China</option>
                    <option value="India">🇮🇳 India</option>
                    <option value="Thailand">🇹🇭 Thailand</option>
                    <option value="Italy">🇮🇹 Italy</option>
                    <option value="Spain">🇪🇸 Spain</option>
                    <option value="Mexico">🇲🇽 Mexico</option>
                    <option value="Peru">🇵🇪 Peru</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="COP">COP - Colombian Peso</option>
                    <option value="BRL">BRL - Brazilian Real</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="CNY">CNY - Chinese Yuan</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
                />
              </div>
            </form>
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 px-6 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                className="flex-1 bg-[#4f0c1b] hover:bg-[#3d0a15] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm hover:shadow active:scale-95"
              >
                {editingSupplier ? 'Update' : 'Add'} Supplier
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {!hiddenColumns.has('name') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                )}
                {!hiddenColumns.has('email') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                )}
                {!hiddenColumns.has('phone') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                )}
                {!hiddenColumns.has('country') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Country
                  </th>
                )}
                {!hiddenColumns.has('actions') && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={getVisibleColumns().length} className="px-6 py-12 text-center text-sm text-gray-500">
                    {searchQuery ? 'No suppliers found matching your search.' : 'No suppliers yet. Add your first supplier to get started.'}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                    {!hiddenColumns.has('name') && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedSupplier(supplier)}
                          className="font-medium text-[#4f0c1b] hover:text-[#3d0a15] hover:underline transition-colors text-left"
                        >
                          {supplier.name}
                        </button>
                      </td>
                    )}
                    {!hiddenColumns.has('email') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{supplier.email || '-'}</td>
                    )}
                    {!hiddenColumns.has('phone') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{supplier.phone || '-'}</td>
                    )}
                    {!hiddenColumns.has('country') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{supplier.country}</td>
                    )}
                    {!hiddenColumns.has('actions') && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="text-[#4f0c1b] hover:text-[#3d0a15] font-medium mr-4 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this supplier?')) {
                              deleteSupplier(supplier.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-700 font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedSupplier && (
        <SupplierDetailPanel
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
        />
      )}
    </div>
  );
}