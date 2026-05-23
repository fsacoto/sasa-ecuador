'use client';

import { useState, useEffect, useRef } from 'react';
import { Client } from '../types';
import { 
  getAllClients, 
  createClient, 
  updateClient, 
  deleteClient 
} from '../services/clientsService';
import { useAuth } from '../context/AuthContext';
import { usePersistedFilterState } from '../hooks/usePersistedFilterState';
import { useTranslation } from '../context/TranslationContext';
import ConfirmDialog from './ui/ConfirmDialog';
import TableSortIcon from './ui/TableSortIcon';
import {
  tableTheadClass,
  tableThAlignClass,
  tableThBaseClass,
  tableThLabelFlexClass,
  tableThSortableClass,
} from './ui/tableHeaderClass';
import { tableRowActionButtonClass } from './ui/tableRowActionClass';

export default function Clients() {
  const { user, hasPermission } = useAuth();
  const userId = user?.id;
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'Ecuador' as 'Ecuador' | 'USA',
    notes: ''
  });
  const [searchTerm, setSearchTerm] = usePersistedFilterState('clients', 'searchTerm', '', userId);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({key: 'name', direction: 'asc'});

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await getAllClients();
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
      alert(t('clients.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showColumnDropdown &&
        columnDropdownRef.current &&
        !columnDropdownRef.current.contains(event.target as Node)
      ) {
        setShowColumnDropdown(false);
      }
      if (
        showSearchDropdown &&
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnDropdown, showSearchDropdown]);

  const openModal = (client?: Client) => {
    if (client) {
      setSelectedClient(client);
      setFormData({
        name: client.name,
        email: client.email || '',
        phone: client.phone || '',
        address: client.address,
        city: client.city,
        country: client.country,
        notes: client.notes || ''
      });
    } else {
      setSelectedClient(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        country: 'Ecuador',
        notes: ''
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedClient(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedClient) {
        // Sales role can only edit Ecuador clients
        if (user?.role === 'sales' && selectedClient.country !== 'Ecuador') {
          alert(t('clients.onlyEditEcuador'));
          return;
        }
        await updateClient(selectedClient.id, formData);
      } else {
        // Sales role can only create Ecuador clients
        if (user?.role === 'sales' && formData.country !== 'Ecuador') {
          alert(t('clients.onlyCreateEcuador'));
          return;
        }
        await createClient(formData);
        setToastMessage(t('clients.addedSuccess'));
        setTimeout(() => setToastMessage(null), 4000);
      }
      closeModal();
      loadClients();
    } catch (error) {
      console.error('Error saving client:', error);
      alert(t('clients.errorSaving'));
    }
  };

  const handleDelete = (client: Client) => {
    setClientToDelete(client);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    
    try {
      await deleteClient(clientToDelete.id);
      loadClients();
      setClientToDelete(null);
    } catch (error) {
      console.error('Error deleting client:', error);
      alert(t('clients.errorDeleting'));
    }
    setDeleteConfirmOpen(false);
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.phone?.includes(searchTerm)
  );

  const canEdit = (client: Client) => {
    if (user?.role === 'sales' && client.country !== 'Ecuador') return false;
    return hasPermission('clients.edit') || hasPermission('clients.edit.ecuador');
  };

  const canDelete = (client: Client) => {
    if (user?.role === 'sales' && client.country !== 'Ecuador') return false;
    return hasPermission('clients.edit') || hasPermission('clients.edit.ecuador');
  };

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedClients = [...filteredClients].sort((a, b) => {
    let aVal: string | number | Date | undefined = a[sortConfig.key as keyof Client];
    let bVal: string | number | Date | undefined = b[sortConfig.key as keyof Client];

    // Handle undefined values
    if (aVal === undefined && bVal === undefined) return 0;
    if (aVal === undefined) return 1;
    if (bVal === undefined) return -1;

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal as string).toLowerCase();
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getVisibleColumns = () => [
    { key: 'name', label: t('clients.name') },
    { key: 'email', label: t('clients.email') },
    { key: 'phone', label: t('clients.phone') },
    { key: 'address', label: t('clients.address') },
    { key: 'city', label: t('clients.city') },
    { key: 'country', label: t('clients.country') },
    { key: 'actions', label: t('clients.actions') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{t('clients.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('clients.subtitle')}</p>
        </div>
 {(hasPermission('clients.create') || hasPermission('clients.create.ecuador') || hasPermission('clients.edit') || hasPermission('clients.edit.ecuador')) && (
          <button
            onClick={() => openModal()}
            className="inline-flex items-center justify-center gap-2 bg-[#515151] text-white px-4 py-2 rounded-lg hover:bg-[#000000] transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('clients.addClient')}
          </button>
        )}
      </div>

      {/* Column visibility + search */}
      <div className="flex items-center justify-end gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
              >
                <svg
                  className={`w-4 h-4 ${hiddenColumns.size > 0 ? 'text-gray-400' : 'text-gray-600'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                <span className="text-sm font-medium text-gray-700">{t('clients.hideFields')}</span>
                {hiddenColumns.size > 0 && (
                  <span className="bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                    {hiddenColumns.size}
                  </span>
                )}
              </button>
              {showColumnDropdown && (
                <div
                  ref={columnDropdownRef}
                  className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10"
                >
                  <div className="p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">{t('clients.columnVisibility')}</div>
                    <div className="grid grid-cols-2 gap-3">
                      {getVisibleColumns().map((column) => (
                        <div key={column.key} className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-700 truncate">{column.label}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (hiddenColumns.has(column.key)) {
                                setHiddenColumns((prev) => {
                                  const next = new Set(prev);
                                  next.delete(column.key);
                                  return next;
                                });
                              } else {
                                setHiddenColumns((prev) => new Set([...prev, column.key]));
                              }
                            }}
                            className={`toggle-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#515151] focus:ring-offset-2 ${
                              hiddenColumns.has(column.key) ? 'toggle-switch-off' : 'toggle-switch-on'
                            }`}
                          >
                            <span
                              className={`toggle-knob inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSearchDropdown(!showSearchDropdown)}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 hover:shadow-md transition-all duration-200 text-sm"
                aria-expanded={showSearchDropdown}
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>
              {showSearchDropdown && (
                <div
                  ref={searchDropdownRef}
                  className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-10"
                >
                  <div className="p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">{t('clients.search')}</div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={t('clients.searchClients')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                      />
                      <svg
                        className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>
      </div>

      {/* Clients List */}
      {loading ? (
        <div className="text-center py-12">{t('clients.loadingClients')}</div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">{t('clients.noClientsFound')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full">
            <thead className={tableTheadClass}>
              <tr>
                {!hiddenColumns.has('name') && (
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('name')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('clients.name')}
                      <TableSortIcon columnKey="name" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('email') && (
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('email')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('clients.email')}
                      <TableSortIcon columnKey="email" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('phone') && (
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('phone')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('clients.phone')}
                      <TableSortIcon columnKey="phone" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('address') && (
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('address')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('clients.address')}
                      <TableSortIcon columnKey="address" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('city') && (
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('city')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('clients.city')}
                      <TableSortIcon columnKey="city" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('country') && (
                  <th
                    className={`${tableThSortableClass} ${tableThAlignClass('left')}`}
                    onClick={() => handleSort('country')}
                  >
                    <div className={tableThLabelFlexClass('left')}>
                      {t('clients.country')}
                      <TableSortIcon columnKey="country" activeKey={sortConfig.key} direction={sortConfig.direction} />
                    </div>
                  </th>
                )}
                {!hiddenColumns.has('actions') && (
                  <th className={`${tableThBaseClass} ${tableThAlignClass('center')}`}>
                    {t('clients.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedClients.map((client) => (
                <tr key={client.id} className="transition-colors hover:bg-gray-50">
                  {!hiddenColumns.has('name') && (
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{client.name}</div>
                    </td>
                  )}
                  {!hiddenColumns.has('email') && (
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{client.email || '-'}</div>
                    </td>
                  )}
                  {!hiddenColumns.has('phone') && (
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{client.phone || '-'}</div>
                    </td>
                  )}
                  {!hiddenColumns.has('address') && (
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{client.address}</div>
                    </td>
                  )}
                  {!hiddenColumns.has('city') && (
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{client.city}</div>
                    </td>
                  )}
                  {!hiddenColumns.has('country') && (
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700">{client.country}</div>
                    </td>
                  )}
                  {!hiddenColumns.has('actions') && (
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {canEdit(client) || canDelete(client) ? (
                        <div className="flex items-center justify-center gap-2">
                          {canEdit(client) && (
                            <button
                              type="button"
                              onClick={() => openModal(client)}
                              className={tableRowActionButtonClass}
                            >
                              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              {t('clients.edit')}
                            </button>
                          )}
                          {canDelete(client) && (
                            <button
                              type="button"
                              onClick={() => handleDelete(client)}
                              className={tableRowActionButtonClass}
                            >
                              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              {t('clients.delete')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">
              {selectedClient ? t('clients.editClient') : t('clients.addClient')}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('clients.nameRequired')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('clients.countryRequired')}
                  </label>
                  <select
                    required
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value as 'Ecuador' | 'USA' })}
                    disabled={user?.role === 'sales'}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] disabled:bg-gray-100"
                  >
                    <option value="Ecuador">Ecuador</option>
                    <option value="USA">USA</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('clients.email')}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('clients.phone')}
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('clients.addressRequired')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('clients.cityRequired')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('clients.notes')}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t('clients.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors"
                >
                  {t('clients.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('common.deleteClient')}
        description={clientToDelete ? `${t('clients.deleteConfirm')} ${clientToDelete.name}?` : ''}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setClientToDelete(null);
        }}
      />

      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
