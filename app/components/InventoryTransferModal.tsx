'use client';

import { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import { InventoryItem, InventoryCountry, InventoryTransfer } from '../types';
import jsPDF from 'jspdf';

interface TransferRow {
  itemId: string;
  quantity: number;
  fromCountry: InventoryCountry;
  toCountry: InventoryCountry;
}

interface InventoryTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InventoryTransferModal({ isOpen, onClose }: InventoryTransferModalProps) {
  const { inventory, moveInventoryBetweenCountries, inventoryTransfers, isTransfersLoading, loadInventoryTransfers } = useInventory();
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState<'move' | 'history' | 'detail'>('move');
  const [selectedTransaction, setSelectedTransaction] = useState<InventoryTransfer | null>(null);
  const [transferRows, setTransferRows] = useState<TransferRow[]>([]);
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [itemSearchQueries, setItemSearchQueries] = useState<Record<number, string>>({});
  const [showSearchDropdowns, setShowSearchDropdowns] = useState<Record<number, boolean>>({});
  const [dropdownPositions, setDropdownPositions] = useState<Record<number, { top: number; left: number; width: number }>>({});
  const [isItemsSectionExpanded, setIsItemsSectionExpanded] = useState<boolean>(true);
  const [sortField, setSortField] = useState<'date' | 'transactionId' | 'createdBy' | 'itemsCount'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const dropdownRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const searchInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    if (isOpen && activeTab === 'history' && !isTransfersLoading) {
      loadInventoryTransfers({ limitCount: 200 }).catch(err => {
        console.error('Failed to load transfers:', err);
        setError('Failed to load transfer history. Please try again.');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab]);

  // Calculate dropdown positions when they open
  const updateDropdownPosition = (index: number) => {
    const inputRef = searchInputRefs.current[index];
    if (inputRef) {
      const rect = inputRef.getBoundingClientRect();
      setDropdownPositions(prev => ({
        ...prev,
        [index]: {
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width
        }
      }));
    }
  };

  useEffect(() => {
    const updatePositions = () => {
      transferRows.forEach((_, index) => {
        if (showSearchDropdowns[index]) {
          updateDropdownPosition(index);
        }
      });
    };

    updatePositions();
    window.addEventListener('scroll', updatePositions, true);
    window.addEventListener('resize', updatePositions);
    
    return () => {
      window.removeEventListener('scroll', updatePositions, true);
      window.removeEventListener('resize', updatePositions);
    };
  }, [transferRows, showSearchDropdowns]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      transferRows.forEach((_, index) => {
        const dropdownRef = dropdownRefs.current[index];
        const inputRef = searchInputRefs.current[index];
        if (
          dropdownRef && !dropdownRef.contains(event.target as Node) &&
          inputRef && !inputRef.contains(event.target as Node)
        ) {
          setShowSearchDropdowns(prev => ({ ...prev, [index]: false }));
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [transferRows]);


  const addRow = () => {
    setTransferRows([...transferRows, {
      itemId: '',
      quantity: 0,
      fromCountry: 'Ecuador',
      toCountry: 'USA'
    }]);
  };

  const removeRow = (index: number) => {
    setTransferRows(transferRows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, updates: Partial<TransferRow>) => {
    const newRows = [...transferRows];
    newRows[index] = { ...newRows[index], ...updates };
    setTransferRows(newRows);
  };

  const getAvailableStock = (itemId: string, country: InventoryCountry): number => {
    const item = inventory.find(i => i.id === itemId);
    if (!item) return 0;
    return country === 'Ecuador' ? item.ecuadorStock : item.usaStock;
  };

  // Filter inventory items based on search query for a specific row
  const getFilteredInventory = (rowIndex: number) => {
    const searchQuery = itemSearchQueries[rowIndex] || '';
    const filtered = inventory.filter(item => {
      const hasStock = item.ecuadorStock > 0 || item.usaStock > 0;
      if (!hasStock) return false;
      
      if (!searchQuery.trim()) return true;
      
      const query = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query) ||
        (item.supplierSKU && item.supplierSKU.toLowerCase().includes(query))
      );
    });
    
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  };

  const handleItemSelect = (rowIndex: number, itemId: string) => {
    const selectedItem = inventory.find(i => i.id === itemId);
    if (selectedItem) {
      updateRow(rowIndex, {
        itemId: itemId,
        fromCountry: selectedItem.ecuadorStock > 0 ? 'Ecuador' : 'USA',
        toCountry: selectedItem.ecuadorStock > 0 ? 'USA' : 'Ecuador',
        quantity: 0
      });
      // Clear search and hide dropdown
      setItemSearchQueries(prev => ({ ...prev, [rowIndex]: '' }));
      setShowSearchDropdowns(prev => ({ ...prev, [rowIndex]: false }));
    }
  };

  // Sort transfers based on selected field and direction
  const getSortedTransfers = () => {
    const sorted = [...inventoryTransfers];
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'date':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'transactionId':
          comparison = a.transactionId.localeCompare(b.transactionId);
          break;
        case 'createdBy':
          const nameA = a.createdBy?.name || '';
          const nameB = b.createdBy?.name || '';
          comparison = nameA.localeCompare(nameB);
          break;
        case 'itemsCount':
          comparison = a.items.length - b.items.length;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  };

  const handleSort = (field: 'date' | 'transactionId' | 'createdBy' | 'itemsCount') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!user) {
      setError(t('inventory.transfer.mustBeLoggedIn'));
      return;
    }

    const validRows = transferRows.filter(row => 
      row.itemId && 
      row.quantity > 0 && 
      row.fromCountry !== row.toCountry &&
      row.quantity <= getAvailableStock(row.itemId, row.fromCountry)
    );

    if (validRows.length === 0) {
      setError(t('inventory.transfer.addAtLeastOneItem'));
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await moveInventoryBetweenCountries({
        items: validRows.map(row => ({
          itemId: row.itemId,
          fromCountry: row.fromCountry,
          toCountry: row.toCountry,
          quantity: row.quantity
        })),
        note: note.trim() || undefined,
        movedBy: {
          uid: user.id,
          name: user.name
        }
      });
      
      // Reset form
      setTransferRows([]);
      setNote('');
      setError('');
      
      // Switch to history and show the new transaction
      setSelectedTransaction(result);
      setActiveTab('detail');
      await loadInventoryTransfers({ limitCount: 200 }).catch(() => {});
    } catch (err) {
      let errorMessage = t('inventory.transfer.validationError');
      
      if (err instanceof Error) {
        errorMessage = err.message;
        
        // Provide user-friendly messages for common errors
        if (err.message.includes('Permission denied') || err.message.includes('permission-denied')) {
          errorMessage = t('inventory.transfer.permissionError') || 'Permission denied. Please ensure Firestore rules are deployed and you are logged in.';
        } else if (err.message.includes('unauthenticated')) {
          errorMessage = t('inventory.transfer.mustBeLoggedIn');
        } else if (err.message.includes('Insufficient stock')) {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      console.error('Transfer error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewDetail = (transfer: InventoryTransfer) => {
    setSelectedTransaction(transfer);
    setActiveTab('detail');
  };

  const handleDownloadPDF = async (transfer: InventoryTransfer) => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = margin;

    // Load logo
    let logoData = '';
    try {
      const response = await fetch('/sasa.png');
      const blob = await response.blob();
      logoData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('Could not load logo:', error);
    }

    // Add logo to top right
    if (logoData) {
      try {
        pdf.addImage(logoData, 'PNG', pageWidth - 50, margin, 30, 10);
      } catch (error) {
        console.warn('Could not add logo to PDF:', error);
      }
    }

    // Title
    pdf.setFontSize(20);
    pdf.setTextColor(251, 227, 227); // #515151
    pdf.setFont('helvetica', 'bold');
    pdf.text('Inventory Transfer Document', margin, yPos);
    yPos += 12;

    // Document Information Section
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    
    const infoStartY = yPos;
    const lineHeight = 6;
    
    // Transaction ID
    pdf.setFont('helvetica', 'bold');
    pdf.text('Transaction ID:', margin, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(transfer.transactionId, margin + 35, yPos);
    yPos += lineHeight;

    // Date and Time
    const dateStr = new Date(transfer.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = new Date(transfer.createdAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
    pdf.setFont('helvetica', 'bold');
    pdf.text('Date:', margin, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${dateStr} at ${timeStr}`, margin + 20, yPos);
    yPos += lineHeight;

    // Created By
    if (transfer.createdBy?.name) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Created By:', margin, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(transfer.createdBy.name, margin + 30, yPos);
      yPos += lineHeight;
    }

    // Total Items
    pdf.setFont('helvetica', 'bold');
    pdf.text('Total Items:', margin, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${transfer.items.length}`, margin + 32, yPos);
    yPos += lineHeight;

    // Draw separator line
    yPos += 5;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Items Table Section
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(251, 227, 227);
    pdf.text('Items Transferred', margin, yPos);
    yPos += 8;

    // Table setup
    const tableStartY = yPos;
    const rowHeight = 8;
    const colWidths = [70, 45, 25, 25, 15];
    const headers = ['Item Name', 'SKU', 'From', 'To', 'Qty'];
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const tableStartX = margin;

    // Draw table header background
    pdf.setFillColor(251, 227, 227);
    pdf.rect(tableStartX, tableStartY - 5, tableWidth, rowHeight, 'F');
    
    // Table Headers
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    let xPos = tableStartX + 2;
    headers.forEach((header, i) => {
      pdf.text(header, xPos, tableStartY);
      xPos += colWidths[i];
    });

    // Table rows
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    let currentY = tableStartY + rowHeight;

    transfer.items.forEach((item, index) => {
      // Check if we need a new page
      if (currentY + rowHeight > pageHeight - 30) {
        pdf.addPage();
        currentY = margin + rowHeight;
        
        // Redraw header on new page
        pdf.setFillColor(251, 227, 227);
        pdf.rect(tableStartX, currentY - rowHeight - 2, tableWidth, rowHeight, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(255, 255, 255);
        xPos = tableStartX + 2;
        headers.forEach((header, i) => {
          pdf.text(header, xPos, currentY - 2);
          xPos += colWidths[i];
        });
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
      }

      // Draw row background (alternating)
      if (index % 2 === 0) {
        pdf.setFillColor(250, 250, 250);
        pdf.rect(tableStartX, currentY - rowHeight + 2, tableWidth, rowHeight - 2, 'F');
      }

      // Draw cell borders
      pdf.setDrawColor(220, 220, 220);
      xPos = tableStartX;
      for (let i = 0; i < colWidths.length; i++) {
        pdf.line(xPos, currentY - rowHeight + 2, xPos, currentY);
        xPos += colWidths[i];
      }
      pdf.line(tableStartX + tableWidth, currentY - rowHeight + 2, tableStartX + tableWidth, currentY);

      // Draw row border
      pdf.line(tableStartX, currentY, tableStartX + tableWidth, currentY);

      // Add cell content
      xPos = tableStartX + 2;
      pdf.text(item.name.substring(0, 30), xPos, currentY - 2);
      xPos += colWidths[0];
      pdf.text(item.sku, xPos, currentY - 2);
      xPos += colWidths[1];
      pdf.text(item.fromCountry, xPos, currentY - 2);
      xPos += colWidths[2];
      pdf.text(item.toCountry, xPos, currentY - 2);
      xPos += colWidths[3];
      pdf.text(item.quantity.toString(), xPos, currentY - 2);
      
      currentY += rowHeight;
    });

    // Draw final border
    pdf.line(tableStartX, currentY - rowHeight, tableStartX + tableWidth, currentY - rowHeight);
    pdf.line(tableStartX, tableStartY - 5, tableStartX, currentY - rowHeight);
    pdf.line(tableStartX + tableWidth, tableStartY - 5, tableStartX + tableWidth, currentY - rowHeight);

    yPos = currentY + 10;

    // Note Section
    if (transfer.note) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;
      
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(251, 227, 227);
      pdf.text('Note:', margin, yPos);
      yPos += 7;
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      const noteLines = pdf.splitTextToSize(transfer.note, pageWidth - 2 * margin);
      noteLines.forEach((line: string) => {
        if (yPos > pageHeight - 20) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.text(line, margin, yPos);
        yPos += 5;
      });
    }

    // Footer
    yPos = pageHeight - 15;
    pdf.setFontSize(8);
    pdf.setTextColor(128, 128, 128);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Generated by SASA Inventory Management System', margin, yPos);
    pdf.text(`Page 1 of ${pdf.getNumberOfPages()}`, pageWidth - margin - 20, yPos, { align: 'right' });

    pdf.save(`Transfer-${transfer.transactionId}.pdf`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-0 duration-300">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('inventory.transfer.title')}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{t('inventory.transfer.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-4">
            <button
              onClick={() => {
                setActiveTab('move');
                setError('');
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'move'
                  ? 'border-[#515151] text-[#515151]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('inventory.transfer.moveTab')}
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                setError('');
                loadInventoryTransfers({ limitCount: 200 });
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-[#515151] text-[#515151]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('inventory.transfer.historyTab')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-12rem)] p-6">
          {activeTab === 'move' ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Transfer Table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => setIsItemsSectionExpanded(!isItemsSectionExpanded)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      <span>{t('inventory.transfer.items')}</span>
                      <svg 
                        className={`w-4 h-4 text-gray-500 transition-transform ${isItemsSectionExpanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={addRow}
                      className="px-3 py-1.5 text-sm bg-[#515151] text-white rounded-lg hover:bg-[#000000] transition-colors"
                    >
                      + {t('inventory.transfer.addItem')}
                    </button>
                  </div>

                  {isItemsSectionExpanded && (
                    <div className="relative border border-gray-200 rounded-lg p-4 bg-white">
                      {transferRows.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                      <p>{t('inventory.transfer.noItemsAdded')}</p>
                      <button
                        type="button"
                        onClick={addRow}
                        className="mt-2 text-[#515151] hover:underline"
                      >
                        {t('inventory.transfer.clickToAdd')}
                      </button>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg relative" style={{ overflow: 'visible' }}>
                      <div className="overflow-x-auto" style={{ overflowY: 'visible' }}>
                        <table className="w-full text-sm" style={{ position: 'relative' }}>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.item')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.quantity')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.from')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.to')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.available')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {transferRows.map((row, index) => {
                          const item = inventory.find(i => i.id === row.itemId);
                          const availableStock = getAvailableStock(row.itemId, row.fromCountry);
                          return (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-3" style={{ overflow: 'visible', position: 'relative' }}>
                                <div className="relative" style={{ zIndex: 10 }}>
                                  {row.itemId ? (
                                    <div>
                                      <div className="flex items-center justify-between px-2 py-1 border border-gray-300 rounded bg-gray-50">
                                        <div>
                                          <div className="font-mono text-sm font-semibold text-[#515151]">
                                            {inventory.find(i => i.id === row.itemId)?.sku}
                                          </div>
                                          <div className="text-sm text-gray-700">
                                            {inventory.find(i => i.id === row.itemId)?.name}
                                          </div>
                                          <div className="text-xs text-gray-600 mt-1">
                                            <span className="mr-3">Ecuador: {inventory.find(i => i.id === row.itemId)?.ecuadorStock || 0}</span>
                                            <span>USA: {inventory.find(i => i.id === row.itemId)?.usaStock || 0}</span>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateRow(index, { itemId: '' });
                                            setItemSearchQueries(prev => ({ ...prev, [index]: '' }));
                                          }}
                                          className="text-gray-400 hover:text-gray-600 ml-2"
                                        >
                                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <input
                                        ref={(el) => { searchInputRefs.current[index] = el; }}
                                        type="text"
                                        value={itemSearchQueries[index] || ''}
                                        onChange={(e) => {
                                          setItemSearchQueries(prev => ({ ...prev, [index]: e.target.value }));
                                          setShowSearchDropdowns(prev => ({ ...prev, [index]: true }));
                                          setTimeout(() => updateDropdownPosition(index), 0);
                                        }}
                                        onFocus={() => {
                                          setShowSearchDropdowns(prev => ({ ...prev, [index]: true }));
                                          setTimeout(() => updateDropdownPosition(index), 0);
                                        }}
                                        placeholder={t('inventory.transfer.searchItems')}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent text-sm"
                                      />
                                      {showSearchDropdowns[index] && getFilteredInventory(index).length > 0 && dropdownPositions[index] && (
                                        <div 
                                          ref={(el) => { dropdownRefs.current[index] = el; }}
                                          className="fixed bg-white border border-gray-300 rounded-lg shadow-2xl max-h-60 overflow-y-auto"
                                          style={{ 
                                            zIndex: 99999, 
                                            position: 'fixed',
                                            top: `${dropdownPositions[index].top}px`,
                                            left: `${dropdownPositions[index].left}px`,
                                            width: `${dropdownPositions[index].width}px`
                                          }}
                                        >
                                          {getFilteredInventory(index).map((item) => (
                                            <div
                                              key={item.id}
                                              onClick={() => handleItemSelect(index, item.id)}
                                              className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                                            >
                                              <div className="font-mono text-sm font-semibold text-[#515151]">{item.sku}</div>
                                              <div className="text-sm text-gray-700">{item.name}</div>
                                              <div className="text-xs text-gray-600 mt-1">
                                                <span className="mr-3">Ecuador: {item.ecuadorStock}</span>
                                                <span>USA: {item.usaStock}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="1"
                                  max={availableStock}
                                  value={row.quantity || ''}
                                  onChange={(e) => updateRow(index, { quantity: parseInt(e.target.value) || 0 })}
                                  required
                                  className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#515151]"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={row.fromCountry}
                                  onChange={(e) => {
                                    const newFrom = e.target.value as InventoryCountry;
                                    updateRow(index, {
                                      fromCountry: newFrom,
                                      toCountry: newFrom === 'Ecuador' ? 'USA' : 'Ecuador'
                                    });
                                  }}
                                  required
                                  className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#515151]"
                                >
                                  <option value="Ecuador">Ecuador</option>
                                  <option value="USA">USA</option>
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={row.toCountry}
                                  onChange={(e) => updateRow(index, { toCountry: e.target.value as InventoryCountry })}
                                  required
                                  className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#515151]"
                                >
                                  <option value="Ecuador">Ecuador</option>
                                  <option value="USA">USA</option>
                                </select>
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {row.itemId ? availableStock : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => removeRow(index)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                    </div>
                  )}
                </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">{t('inventory.transfer.note')}</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={t('inventory.transfer.notePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all font-medium text-gray-700"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || transferRows.length === 0}
                  className="flex-1 bg-[#515151] hover:bg-[#000000] text-white px-6 py-2.5 rounded-xl transition-all font-medium shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? t('inventory.transfer.moving') : t('inventory.transfer.move')}
                </button>
              </div>
            </form>
          ) : activeTab === 'detail' && selectedTransaction ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">{t('inventory.transfer.transactionDetails')}</h4>
                  <p className="text-sm text-gray-500 mt-1">Transaction ID: {selectedTransaction.transactionId}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleDownloadPDF(selectedTransaction).catch(err => {
                        console.error('Failed to generate PDF:', err);
                        setError('Failed to generate PDF. Please try again.');
                      });
                    }}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {t('inventory.transfer.downloadPDF')}
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {t('common.back')}
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('inventory.transfer.date')}:</span>
                  <span className="font-medium">{new Date(selectedTransaction.createdAt).toLocaleString('en-US')}</span>
                </div>
                {selectedTransaction.createdBy?.name && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('inventory.transfer.movedBy')}:</span>
                    <span className="font-medium">{selectedTransaction.createdBy.name}</span>
                  </div>
                )}
                {selectedTransaction.note && (
                  <div>
                    <span className="text-gray-600">{t('inventory.transfer.note')}:</span>
                    <p className="mt-1 text-gray-900">{selectedTransaction.note}</p>
                  </div>
                )}
              </div>

              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-3">{t('inventory.transfer.items')}</h5>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.item')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.from')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.to')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('inventory.transfer.quantity')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedTransaction.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                          <td className="px-4 py-3 text-gray-600 font-mono">{item.sku}</td>
                          <td className="px-4 py-3 text-gray-700">{item.fromCountry}</td>
                          <td className="px-4 py-3 text-gray-700">{item.toCountry}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">{t('inventory.transfer.historyTab')}</h4>
                  <p className="text-sm text-gray-500 mt-1">{t('inventory.transfer.historySubtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Sort Dropdown */}
                  <select
                    value={sortField}
                    onChange={(e) => handleSort(e.target.value as 'date' | 'transactionId' | 'createdBy' | 'itemsCount')}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#515151] focus:border-transparent"
                  >
                    <option value="date">{t('inventory.transfer.sortByDate')}</option>
                    <option value="transactionId">{t('inventory.transfer.sortByTransactionId')}</option>
                    <option value="createdBy">{t('inventory.transfer.sortByCreatedBy')}</option>
                    <option value="itemsCount">{t('inventory.transfer.sortByItemsCount')}</option>
                  </select>
                  <button
                    onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                    className="px-2 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    title={sortDirection === 'asc' ? t('inventory.transfer.sortAscending') : t('inventory.transfer.sortDescending')}
                  >
                    {sortDirection === 'asc' ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setError('');
                      loadInventoryTransfers({ limitCount: 200 }).catch(err => {
                        console.error('Failed to refresh transfers:', err);
                        setError('Failed to refresh transfer history.');
                      });
                    }}
                    disabled={isTransfersLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isTransfersLoading ? t('common.loading') : t('inventory.transfer.refresh')}
                  </button>
                </div>
              </div>

              {error && activeTab === 'history' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {isTransfersLoading ? (
                <div className="text-center py-16">
                  <div className="text-gray-500 font-medium">{t('common.loading')}</div>
                </div>
              ) : inventoryTransfers.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-gray-500 font-medium">{t('inventory.transfer.noHistory')}</div>
                  <p className="text-sm text-gray-400 mt-2">Transfer history will appear here after you move inventory between countries.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {getSortedTransfers().map((tr) => (
                    <div
                      key={tr.id}
                      className="bg-white border border-gray-200 rounded-lg p-5 hover:border-[#515151] hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => handleViewDetail(tr)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              {tr.transactionId}
                            </span>
                            <span className="text-sm text-gray-500">
                              {new Date(tr.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })} at {new Date(tr.createdAt).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          {tr.createdBy?.name && (
                            <div className="text-sm text-gray-600">
                              Moved by <span className="font-medium text-gray-900">{tr.createdBy.name}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">{tr.items.length}</div>
                          <div className="text-xs text-gray-500">
                            {tr.items.length === 1 ? 'item' : 'items'}
                          </div>
                        </div>
                      </div>

                      {tr.note && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="text-xs text-gray-500 mb-1">Note:</div>
                          <div className="text-sm text-gray-700">{tr.note}</div>
                        </div>
                      )}

                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="text-xs font-medium text-gray-700 mb-2">Items:</div>
                        <div className="space-y-2">
                          {tr.items.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span className="text-gray-900 font-medium">{item.name}</span>
                              <span className="text-gray-600">
                                {item.quantity} from {item.fromCountry} to {item.toCountry}
                              </span>
                            </div>
                          ))}
                          {tr.items.length > 3 && (
                            <div className="text-xs text-gray-500 pt-1">
                              +{tr.items.length - 3} more {tr.items.length - 3 === 1 ? 'item' : 'items'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetail(tr);
                          }}
                          className="text-sm font-medium text-[#515151] hover:text-[#000000]"
                        >
                          View Full Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
