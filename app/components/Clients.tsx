'use client';

import { useState, useEffect } from 'react';
import { Client } from '../types';
import { 
  getAllClients, 
  createClient, 
  updateClient, 
  deleteClient 
} from '../services/clientsService';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';

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
  const [filterCountry, setFilterCountry] = useState<'Ecuador' | 'USA' | 'All'>('All');
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({key: 'name', direction: 'asc'});

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

  const handleDelete = async (client: Client) => {
    if (!confirm(`${t('clients.deleteConfirm')} ${client.name}?`)) return;
    
    try {
      await deleteClient(client.id);
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert(t('clients.errorDeleting'));
    }
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

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal as string).toLowerCase();
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{t('clients.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('clients.subtitle')}</p>
        </div>
        {(hasPermission('clients.create') || hasPermission('clients.create.ecuador')) && (
          <button
            onClick={() => openModal()}
            className="bg-[#4f0c1b] text-white px-4 py-2 rounded-lg hover:bg-[#5c1327] transition-colors"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
            />
          </div>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value as 'Ecuador' | 'USA' | 'All')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] focus:border-transparent"
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
                    <div className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-medium">
                      {client.country === 'Ecuador' ? '🇪🇨 Ecuador' : '🇺🇸 USA'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex gap-2 justify-center">
                      {canEdit(client) && (
                        <button
                          onClick={() => openModal(client)}
                          className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                          title={t('clients.edit')}
                        >
                          ✏️
                        </button>
                      )}
                      {canDelete(client) && (
                        <button
                          onClick={() => handleDelete(client)}
                          className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                          title={t('clients.delete')}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b]"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b] disabled:bg-gray-100"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b]"
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b]"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b]"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b]"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4f0c1b]"
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
                  className="px-4 py-2 bg-[#4f0c1b] text-white rounded-lg hover:bg-[#5c1327] transition-colors"
                >
                  {t('clients.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

