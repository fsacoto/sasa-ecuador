'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Client } from '../types';
import { 
  getAllClients, 
  createClient, 
  updateClient, 
  deleteClient 
} from '../services/clientsService';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import ConfirmDialog from './ui/ConfirmDialog';

export default function Clients() {
  const { user, hasPermission } = useAuth();
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
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [filterCountry, setFilterCountry] = useState<'Ecuador' | 'USA' | 'All'>('All');
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({key: 'name', direction: 'asc'});

  const [clientActionsMenuId, setClientActionsMenuId] = useState<string | null>(null);
  const [clientActionsMenuPos, setClientActionsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const clientActionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const CLIENT_MENU_MIN_WIDTH = 192;

  const syncClientActionsMenuPosition = useCallback(() => {
    const btn = clientActionsButtonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pad = 8;
    let left = r.right - CLIENT_MENU_MIN_WIDTH;
    left = Math.max(pad, Math.min(left, window.innerWidth - CLIENT_MENU_MIN_WIDTH - pad));
    setClientActionsMenuPos({ top: r.bottom + 4, left });
  }, []);

  const closeClientActionsMenu = useCallback(() => {
    setClientActionsMenuId(null);
    setClientActionsMenuPos(null);
    clientActionsButtonRef.current = null;
  }, []);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const country = filterCountry === 'All' ? undefined : filterCountry;
      const data = await getAllClients(country);
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
      alert(t('clients.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [filterCountry]);

  useEffect(() => {
    const closeOnOutside = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-client-actions-root]');
      if (!el) closeClientActionsMenu();
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [closeClientActionsMenu]);

  useLayoutEffect(() => {
    if (!clientActionsMenuId) {
      setClientActionsMenuPos(null);
      return;
    }
    syncClientActionsMenuPosition();
  }, [clientActionsMenuId, syncClientActionsMenuPosition]);

  useEffect(() => {
    if (!clientActionsMenuId) return;
    const onScrollOrResize = () => syncClientActionsMenuPosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [clientActionsMenuId, syncClientActionsMenuPosition]);

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

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <span className="text-gray-400">↕</span>;
    return sortConfig.direction === 'asc' ? <span>↑</span> : <span>↓</span>;
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

  const clientForActionsMenu = clientActionsMenuId
    ? sortedClients.find((c) => c.id === clientActionsMenuId)
    : undefined;

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
            className="bg-[#515151] text-white px-4 py-2 rounded-lg hover:bg-[#000000] transition-colors"
          >
            {t('clients.addClient')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder={t('clients.searchClients')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
            />
          </div>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value as 'Ecuador' | 'USA' | 'All')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#515151] focus:border-transparent"
          >
            <option value="All">{t('clients.allCountries')}</option>
            <option value="Ecuador">Ecuador</option>
            <option value="USA">USA</option>
          </select>
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
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    {t('clients.name')}
                    <SortIcon columnKey="name" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center gap-2">
                    {t('clients.email')}
                    <SortIcon columnKey="email" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('phone')}
                >
                  <div className="flex items-center gap-2">
                    {t('clients.phone')}
                    <SortIcon columnKey="phone" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('address')}
                >
                  <div className="flex items-center gap-2">
                    {t('clients.address')}
                    <SortIcon columnKey="address" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('city')}
                >
                  <div className="flex items-center gap-2">
                    {t('clients.city')}
                    <SortIcon columnKey="city" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('country')}
                >
                  <div className="flex items-center gap-2">
                    {t('clients.country')}
                    <SortIcon columnKey="country" />
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase">{t('clients.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedClients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{client.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">{client.email || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">{client.phone || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">{client.address}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">{client.city}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">{client.country}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {canEdit(client) || canDelete(client) ? (
                      <div className="inline-flex justify-center" data-client-actions-root>
                        <button
                          type="button"
                          onClick={(e) => {
                            const opening = clientActionsMenuId !== client.id;
                            if (opening) {
                              clientActionsButtonRef.current = e.currentTarget;
                              setClientActionsMenuId(client.id);
                            } else {
                              closeClientActionsMenu();
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                          aria-expanded={clientActionsMenuId === client.id}
                          aria-haspopup="menu"
                        >
                          {t('clients.actions')}
                          <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {clientActionsMenuId &&
        clientActionsMenuPos &&
        clientForActionsMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-client-actions-root
            role="menu"
            className="fixed z-[100] min-w-[12rem] rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg"
            style={{ top: clientActionsMenuPos.top, left: clientActionsMenuPos.left }}
          >
            {canEdit(clientForActionsMenu) && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  openModal(clientForActionsMenu);
                  closeClientActionsMenu();
                }}
              >
                <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {t('clients.edit')}
              </button>
            )}
            {canDelete(clientForActionsMenu) && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  handleDelete(clientForActionsMenu);
                  closeClientActionsMenu();
                }}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {t('clients.delete')}
              </button>
            )}
          </div>,
          document.body
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
    </div>
  );
}

