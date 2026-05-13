'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from './context/AuthContext';
import { useTranslation } from './context/TranslationContext';
import { db } from './utils/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from './utils/firebase';
import { uploadImage } from './services/storageService';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import Suppliers from './components/Suppliers';
import PurchaseOrders from './components/PurchaseOrders';
import Inventory from './components/Inventory';
import LandedCosts from './components/LandedCosts';
import CMSModule from './components/CMSModuleNew';
import Clients from './components/Clients';
import Sales from './components/Sales';
import SalesNotesHistory from './components/SalesNotesHistory';
import InvoiceTracking from './components/InvoiceTracking';
import Consignments from './components/Consignments';
import SettingsHub from './components/SettingsHub';

type Tab =
  | 'dashboard'
  | 'inventory-suite'
  | 'suppliers'
  | 'purchase-orders'
  | 'inventory'
  | 'landed-costs'
  | 'cms'
  | 'sales-suite'
  | 'clients'
  | 'sales'
  | 'sales-notes'
  | 'invoice-tracking'
  | 'consignments'
  | 'settings';

/** Palabras clave extra para búsqueda en navegación */
const TAB_SEARCH_ALIASES: Partial<Record<Tab, string>> = {
  dashboard: 'inicio panel principal métricas resumen',
  suppliers: 'proveedores compras abastecimiento',
  'purchase-orders': 'órdenes compra pedidos oc proveedor',
  inventory: 'inventario stock sku productos bodega almacén ecuador',
  'landed-costs': 'costos destino flete logística importación',
  cms: 'contenido medios marketing catálogo web',
  clients: 'clientes contactos cuentas crm',
  sales: 'generación notas de venta NOTAV emitir registrar pedidos cobros',
  'sales-notes': 'historial notas ventas listado NOTAV pdf',
  'invoice-tracking': 'notas de ventas seguimiento cobranza pagos NOTAV',
  consignments: 'consignaciones consigna',
  settings: 'configuración perfil preferencias integraciones notificaciones escáner contabilidad',
};

type NavSearchEntry = { tab: Tab; title: string; path: string; haystack: string };
type ProfileFormState = { firstName: string; lastName: string; photoURL: string };

/** Active indicator (inset left bar) — SASA pink */
const SIDEBAR_ACCENT = '#7a7a7a';
/** Expanded sidebar width — compact */
const SIDEBAR_EXPANDED_PX = 192;

function IconDashboard({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

function IconCMS({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconWarehouse({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconTruck({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10h10zm0 0h2.586a1 1 0 00.707-.293l2.414-2.414a1 1 0 00.293-.707V9a1 1 0 00-1-1h-1m-8 0H7" />
    </svg>
  );
}

function IconClipboard({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function IconCube({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function IconCalculator({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function IconTrending({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function IconUsers({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function IconShopping({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function IconDocument({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconArchive({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  );
}

function IconChevronLeft({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevronDown({ className = 'w-4 h-4 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function IconSearch({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconUserOutline({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function IconCog({ className = 'w-5 h-5 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.757.427 1.757 2.925 0 3.351a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.427 1.757-2.925 1.757-3.351 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.757-.427-1.757-2.925 0-3.351a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

const INVENTORY_TABS: Tab[] = ['suppliers', 'purchase-orders', 'inventory', 'landed-costs'];
const SALES_TABS: Tab[] = ['clients', 'sales', 'sales-notes', 'invoice-tracking', 'consignments'];

/** Ocultar el CMS en la barra lateral y el contenido. El módulo sigue en el proyecto; poner `true` para mostrarlo de nuevo. */
const SHOW_CMS_IN_NAVIGATION = false;

function AppContent() {
  const { user, logout, hasPermission, isLoading } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>(
    user?.role === 'marketing' && SHOW_CMS_IN_NAVIGATION ? 'cms' : 'dashboard'
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [salesOpen, setSalesOpen] = useState(true);
  const [suiteFlyout, setSuiteFlyout] = useState<'inventory-suite' | 'sales-suite' | null>(null);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [navSearchQuery, setNavSearchQuery] = useState('');
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const [navSearchHighlight, setNavSearchHighlight] = useState(0);
  const navSearchRef = useRef<HTMLDivElement>(null);
  const navSearchInputRef = useRef<HTMLInputElement>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    firstName: '',
    lastName: '',
    photoURL: '',
  });
  const [profileSaved, setProfileSaved] = useState<ProfileFormState>({
    firstName: '',
    lastName: '',
    photoURL: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profilePhotoMenuOpen, setProfilePhotoMenuOpen] = useState(false);
  const profilePhotoMenuRef = useRef<HTMLDivElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const [darkModeOn, setDarkModeOn] = useState(false);
  const [photoCropOpen, setPhotoCropOpen] = useState(false);
  const [photoCropSrc, setPhotoCropSrc] = useState('');
  const [photoCropOffset, setPhotoCropOffset] = useState({ x: 0, y: 0 });
  const [photoCropZoom, setPhotoCropZoom] = useState(1);
  const [photoCropDragging, setPhotoCropDragging] = useState(false);
  const [photoCropImageSize, setPhotoCropImageSize] = useState({ width: 1, height: 1 });
  const photoCropDragRef = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    if (!SHOW_CMS_IN_NAVIGATION && activeTab === 'cms') {
      setActiveTab('dashboard');
      return;
    }
    if (
      SHOW_CMS_IN_NAVIGATION &&
      user?.role === 'marketing' &&
      activeTab !== 'cms' &&
      activeTab !== 'settings'
    ) {
      setActiveTab('cms');
    } else if (user?.role !== 'marketing' && activeTab === 'cms' && !hasPermission('cms.view')) {
      setActiveTab('dashboard');
    }
  }, [user?.role, activeTab, hasPermission]);

  useEffect(() => {
    if (INVENTORY_TABS.includes(activeTab)) setInventoryOpen(true);
    if (SALES_TABS.includes(activeTab)) setSalesOpen(true);
  }, [activeTab]);

  useEffect(() => {
    if (!suiteFlyout) return;
    const close = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setSuiteFlyout(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [suiteFlyout]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!navSearchOpen) return;
    const close = (e: MouseEvent) => {
      if (navSearchRef.current && !navSearchRef.current.contains(e.target as Node)) {
        setNavSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [navSearchOpen]);

  useEffect(() => {
    if (!profilePhotoMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (profilePhotoMenuRef.current && !profilePhotoMenuRef.current.contains(e.target as Node)) {
        setProfilePhotoMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [profilePhotoMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.id));
        const firstName =
          snap.exists() && typeof snap.data().name === 'string' && snap.data().name.trim().length > 0
            ? snap.data().name.trim()
            : user.name;
        const lastName =
          snap.exists() && typeof snap.data().lastName === 'string' ? snap.data().lastName.trim() : '';
        const photoURL =
          snap.exists() && typeof snap.data().photoURL === 'string' ? snap.data().photoURL.trim() : '';
        if (!cancelled) {
          const next = { firstName, lastName, photoURL };
          setProfileSaved(next);
          setProfileForm(next);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        if (!cancelled) {
          setProfileForm((prev) => ({ ...prev, firstName: user.name }));
        }
      }
    };
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('sasaDarkMode');
    if (saved === 'on') setDarkModeOn(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('sasaDarkMode', darkModeOn ? 'on' : 'off');
  }, [darkModeOn]);

  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          darkModeOn ? 'bg-black text-white' : 'bg-[#f9f9f9] text-gray-700'
        }`}
      >
        <div className="text-center">
          <div
            className={`animate-spin rounded-full h-12 w-12 border-2 border-transparent mx-auto ${
              darkModeOn ? 'border-t-white border-r-white/70' : 'border-t-[#515151] border-r-[#515151]/60'
            }`}
            aria-hidden
          />
          <p className={`mt-4 ${darkModeOn ? 'text-gray-200' : 'text-gray-600'}`}>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const PHOTO_FRAME_SIZE = 260;
  const displayName = `${profileSaved.firstName || user.name}${profileSaved.lastName ? ` ${profileSaved.lastName}` : ''}`.trim();

  const handleProfilePhotoChange = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) return;
      const img = new window.Image();
      img.onload = () => {
        setPhotoCropImageSize({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
        setPhotoCropOffset({ x: 0, y: 0 });
        setPhotoCropZoom(1);
        setPhotoCropSrc(src);
        setPhotoCropOpen(true);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const uploadCroppedProfilePhoto = async () => {
    if (!user || !photoCropSrc) return;
    try {
      setProfileSaving(true);
      setProfileError('');
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create crop canvas.');

      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not load image for cropping.'));
        img.src = photoCropSrc;
      });

      const fitScale = Math.max(PHOTO_FRAME_SIZE / photoCropImageSize.width, PHOTO_FRAME_SIZE / photoCropImageSize.height);
      const renderWidth = photoCropImageSize.width * fitScale * photoCropZoom;
      const renderHeight = photoCropImageSize.height * fitScale * photoCropZoom;
      const drawX = (PHOTO_FRAME_SIZE - renderWidth) / 2 + photoCropOffset.x;
      const drawY = (PHOTO_FRAME_SIZE - renderHeight) / 2 + photoCropOffset.y;
      const outScale = canvas.width / PHOTO_FRAME_SIZE;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, drawX * outScale, drawY * outScale, renderWidth * outScale, renderHeight * outScale);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Could not export cropped image.'));
        }, 'image/jpeg', 0.92);
      });

      const croppedFile = new File([blob], `profile_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const path = `images/profiles/${user.id}/${Date.now()}_profile.jpg`;
      const photoURL = await uploadImage(croppedFile, path);
      setProfileForm((prev) => ({ ...prev, photoURL }));
      setPhotoCropOpen(false);
      setPhotoCropSrc('');
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      setProfileError('Could not upload profile photo. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    const firstName = profileForm.firstName.trim();
    const lastName = profileForm.lastName.trim();
    if (!firstName) {
      setProfileError('First name is required.');
      return;
    }
    try {
      setProfileSaving(true);
      setProfileError('');
      const payload = {
        name: firstName,
        lastName,
        photoURL: profileForm.photoURL || '',
      };
      try {
        await updateDoc(doc(db, 'users', user.id), payload);
      } catch {
        await setDoc(doc(db, 'users', user.id), payload, { merge: true });
      }
      setProfileSaved({
        firstName,
        lastName,
        photoURL: profileForm.photoURL || '',
      });
      setProfileModalOpen(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      setProfileError('Could not save profile. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const resetProfileDraft = () => {
    setProfileForm(profileSaved);
    setProfilePhotoMenuOpen(false);
    setProfileError('');
  };

  const changePasswordWithReauth = async (currentPassword: string, nextPassword: string): Promise<string | null> => {
    try {
      if (!auth.currentUser || !auth.currentUser.email) {
        return 'No authenticated user found.';
      }
      if (nextPassword.length < 8) {
        return 'New password must be at least 8 characters.';
      }
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, nextPassword);
      return null;
    } catch (error) {
      console.error('Error updating password:', error);
      return 'Could not update password. Verify your current password and try again.';
    }
  };

  const getTabs = () => {
    if (user?.role === 'marketing' && SHOW_CMS_IN_NAVIGATION) {
      return [{ id: 'cms' as Tab, label: t('navigation.cms'), permission: 'cms.view' }].filter((tab) =>
        hasPermission(tab.permission)
      );
    }

    const baseTabs: { id: Tab; label: string; permission: string }[] = [
      { id: 'dashboard', label: t('navigation.dashboard'), permission: 'inventory.view' },
    ];

    if (user?.role === 'sales') {
      baseTabs.push(
        { id: 'inventory', label: t('navigation.inventoryEC'), permission: 'inventory.view.ecuador' },
        { id: 'clients', label: t('navigation.clients'), permission: 'clients.view.ecuador' },
        { id: 'sales', label: t('navigation.sales'), permission: 'sales.view' },
        { id: 'sales-notes', label: t('navigation.salesNotes'), permission: 'sales.view' },
        { id: 'invoice-tracking', label: t('navigation.invoiceTracking'), permission: 'sales.view' }
      );
    } else {
      if (SHOW_CMS_IN_NAVIGATION && hasPermission('cms.view')) {
        baseTabs.push({ id: 'cms', label: t('navigation.cms'), permission: 'cms.view' });
      }
      if (
        hasPermission('inventory.view') ||
        hasPermission('suppliers.view') ||
        hasPermission('purchase.view') ||
        hasPermission('costs.view')
      ) {
        baseTabs.push({
          id: 'inventory-suite',
          label: t('navigation.inventorySuite'),
          permission: 'inventory.view',
        });
      }
      if (hasPermission('clients.view') || hasPermission('sales.view')) {
        baseTabs.push({
          id: 'sales-suite',
          label: t('navigation.salesSuite'),
          permission: 'sales.view',
        });
      }
    }

    return baseTabs.filter((tab) => hasPermission(tab.permission));
  };

  const tabs = getTabs();

  const isInventoryActive = INVENTORY_TABS.includes(activeTab);
  const isSalesActive = SALES_TABS.includes(activeTab);

  type SubNavItem = { id: Tab; label: string; IconEl: typeof IconTruck; visible: boolean };

  const inventorySubItems: SubNavItem[] = [
    { id: 'suppliers' as Tab, label: t('navigation.suppliers'), IconEl: IconTruck, visible: hasPermission('suppliers.view') },
    {
      id: 'purchase-orders' as Tab,
      label: t('navigation.purchaseOrders'),
      IconEl: IconClipboard,
      visible: hasPermission('purchase.view'),
    },
    {
      id: 'inventory' as Tab,
      label: t('navigation.inventory'),
      IconEl: IconCube,
      visible: hasPermission('inventory.view') || hasPermission('inventory.view.ecuador'),
    },
    {
      id: 'landed-costs' as Tab,
      label: t('navigation.landedCosts'),
      IconEl: IconCalculator,
      visible: hasPermission('costs.view'),
    },
  ].filter((item) => item.visible);

  const salesSubItems: SubNavItem[] = [
    {
      id: 'clients' as Tab,
      label: t('navigation.clients'),
      IconEl: IconUsers,
      visible: hasPermission('clients.view') || hasPermission('clients.view.ecuador'),
    },
    { id: 'sales' as Tab, label: t('navigation.sales'), IconEl: IconShopping, visible: hasPermission('sales.view') },
    {
      id: 'sales-notes' as Tab,
      label: t('navigation.salesNotes'),
      IconEl: IconClipboard,
      visible: hasPermission('sales.view'),
    },
    {
      id: 'invoice-tracking' as Tab,
      label: t('navigation.invoiceTracking'),
      IconEl: IconDocument,
      visible: hasPermission('sales.view') || hasPermission('sales.invoice.create'),
    },
    {
      id: 'consignments' as Tab,
      label: t('navigation.consignments'),
      IconEl: IconArchive,
      visible: hasPermission('sales.view') || hasPermission('sales.create'),
    },
  ].filter((item) => item.visible);

  const invSuiteLabel = t('navigation.inventorySuite');
  const salesSuiteLabel = t('navigation.salesSuite');

  const navSearchEntries: NavSearchEntry[] = (() => {
    const out: NavSearchEntry[] = [];
    const pushEntry = (tab: Tab, title: string, path: string) => {
      const alias = TAB_SEARCH_ALIASES[tab] ?? '';
      const haystack = `${path} ${title} ${alias}`.toLowerCase().replace(/\s+/g, ' ');
      out.push({ tab, title, path, haystack });
    };
    for (const tab of tabs) {
      if (tab.id === 'inventory-suite') {
        for (const item of inventorySubItems) {
          pushEntry(item.id, item.label, `${invSuiteLabel} › ${item.label}`);
        }
      } else if (tab.id === 'sales-suite') {
        for (const item of salesSubItems) {
          pushEntry(item.id, item.label, `${salesSuiteLabel} › ${item.label}`);
        }
      } else {
        pushEntry(tab.id, tab.label, tab.label);
      }
    }
    return out;
  })();

  const navSearchQueryNorm = navSearchQuery.trim().toLowerCase();
  const navSearchResults =
    navSearchQueryNorm.length === 0
      ? []
      : navSearchEntries.filter((e) => e.haystack.includes(navSearchQueryNorm));

  const navSearchHi =
    navSearchResults.length === 0
      ? 0
      : Math.min(navSearchHighlight, navSearchResults.length - 1);

  const applyNavSearch = (entry: NavSearchEntry) => {
    setActiveTab(entry.tab);
    setNavSearchQuery('');
    setNavSearchOpen(false);
    setNavSearchHighlight(0);
    setSuiteFlyout(null);
    navSearchInputRef.current?.blur();
  };

  const navButtonClass = (active: boolean) =>
    `relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ${
      active ? 'bg-[#232323] text-[#c5c5c5]' : 'text-[#c5c5c5] hover:bg-[#1a1a1a] hover:text-[#c5c5c5]'
    }`;

  const subButtonClass = (active: boolean) =>
    `relative flex w-full items-center gap-1.5 rounded py-1 pl-2 pr-1.5 text-left text-[11px] leading-snug font-normal transition-colors ${
      active ? 'bg-[#232323] text-[#c5c5c5]' : 'text-[#c5c5c5] hover:bg-[#1a1a1a] hover:text-[#c5c5c5]'
    }`;

  const sidebarWidth = sidebarCollapsed ? 72 : SIDEBAR_EXPANDED_PX;

  const renderFlyout = (
    suite: 'inventory-suite' | 'sales-suite',
    items: { id: Tab; label: string; IconEl: typeof IconTruck }[]
  ) => {
    if (!sidebarCollapsed || suiteFlyout !== suite) return null;
    return (
      <div
        ref={flyoutRef}
        className={`fixed z-[60] w-48 rounded-lg py-1 shadow-lg ${
          darkModeOn ? 'border border-gray-700 bg-[#101010]' : 'border border-gray-200 bg-white'
        }`}
        style={{ left: sidebarWidth, top: Math.max(16, flyoutTop) }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActiveTab(item.id);
              setSuiteFlyout(null);
            }}
            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
              activeTab === item.id
                ? darkModeOn
                  ? 'bg-[#1a1a1a] font-medium text-[#c5c5c5]'
                  : 'bg-gray-100 font-medium text-gray-800'
                : darkModeOn
                  ? 'text-[#c5c5c5] hover:bg-[#1a1a1a]'
                  : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <item.IconEl className={`h-3.5 w-3.5 shrink-0 ${darkModeOn ? 'text-[#c5c5c5]' : 'text-gray-500'}`} />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[#f9f9f9] pt-12">
      <aside
        className="flex min-h-0 shrink-0 flex-col bg-[#101010] text-[#c5c5c5] transition-[width] duration-200 ease-out"
        style={{ width: sidebarWidth }}
      >
        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 py-3">
          {tabs.map((tab) => {
            if (tab.id === 'inventory-suite') {
              return (
                <div key={tab.id} className="relative">
                  <button
                    type="button"
                    title={sidebarCollapsed ? tab.label : undefined}
                    onClick={(e) => {
                      if (sidebarCollapsed) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setFlyoutTop(rect.top);
                        setSuiteFlyout((s) => (s === 'inventory-suite' ? null : 'inventory-suite'));
                      } else {
                        setInventoryOpen((o) => !o);
                      }
                    }}
                    className={`${navButtonClass(isInventoryActive)} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                    style={
                      isInventoryActive
                        ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` }
                        : undefined
                    }
                  >
                    <IconWarehouse className="h-4 w-4 shrink-0 text-[#c5c5c5]" />
                    {!sidebarCollapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>
                        <IconChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-[#c5c5c5] transition-transform ${inventoryOpen ? 'rotate-180' : ''}`}
                        />
                      </>
                    )}
                  </button>
                  {!sidebarCollapsed && inventoryOpen && (
                    <div className="mt-0.5 space-y-1 border-l border-gray-200 pl-1.5 ml-2.5">
                      {inventorySubItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={subButtonClass(activeTab === item.id)}
                          style={
                            activeTab === item.id
                              ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` }
                              : undefined
                          }
                        >
                          <item.IconEl className="h-3.5 w-3.5 shrink-0 text-[#c5c5c5]" />
                          <span className="min-w-0 truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {renderFlyout('inventory-suite', inventorySubItems)}
                </div>
              );
            }
            if (tab.id === 'sales-suite') {
              return (
                <div key={tab.id} className="relative">
                  <button
                    type="button"
                    title={sidebarCollapsed ? tab.label : undefined}
                    onClick={(e) => {
                      if (sidebarCollapsed) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setFlyoutTop(rect.top);
                        setSuiteFlyout((s) => (s === 'sales-suite' ? null : 'sales-suite'));
                      } else {
                        setSalesOpen((o) => !o);
                      }
                    }}
                    className={`${navButtonClass(isSalesActive)} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                    style={
                      isSalesActive
                        ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` }
                        : undefined
                    }
                  >
                    <IconTrending className="h-4 w-4 shrink-0 text-[#c5c5c5]" />
                    {!sidebarCollapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>
                        <IconChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-[#c5c5c5] transition-transform ${salesOpen ? 'rotate-180' : ''}`}
                        />
                      </>
                    )}
                  </button>
                  {!sidebarCollapsed && salesOpen && (
                    <div className="mt-0.5 space-y-1 border-l border-gray-200 pl-1.5 ml-2.5">
                      {salesSubItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={subButtonClass(activeTab === item.id)}
                          style={
                            activeTab === item.id
                              ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` }
                              : undefined
                          }
                        >
                          <item.IconEl className="h-3.5 w-3.5 shrink-0 text-[#c5c5c5]" />
                          <span className="min-w-0 truncate">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {renderFlyout('sales-suite', salesSubItems)}
                </div>
              );
            }

            const leafActive = activeTab === tab.id;
            const LeafIcon =
              tab.id === 'dashboard'
                ? IconDashboard
                : tab.id === 'cms'
                  ? IconCMS
                  : tab.id === 'inventory'
                    ? IconCube
                    : tab.id === 'clients'
                      ? IconUsers
                      : tab.id === 'sales'
                        ? IconShopping
                        : tab.id === 'sales-notes'
                          ? IconClipboard
                          : tab.id === 'invoice-tracking'
                            ? IconDocument
                            : tab.id === 'settings'
                              ? IconCog
                              : IconDashboard;

            return (
              <button
                key={tab.id}
                type="button"
                title={sidebarCollapsed ? tab.label : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={`${navButtonClass(leafActive)} ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                style={leafActive ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` } : undefined}
              >
                <LeafIcon className="h-4 w-4 shrink-0 text-[#c5c5c5]" />
                {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-1.5 py-2 space-y-1.5">
          {hasPermission('settings.view') && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('settings');
                setSuiteFlyout(null);
              }}
              className={`flex w-full items-center gap-1.5 rounded-md py-1.5 text-xs transition-colors ${
                sidebarCollapsed ? 'justify-center px-0' : 'justify-start px-2 text-left'
              } ${
                activeTab === 'settings'
                  ? 'bg-[#232323] text-[#c5c5c5]'
                  : 'text-[#c5c5c5] hover:bg-[#1a1a1a] hover:text-[#c5c5c5]'
              }`}
              title="Settings"
              style={activeTab === 'settings' ? { boxShadow: `inset 2px 0 0 0 ${SIDEBAR_ACCENT}` } : undefined}
            >
              <IconCog className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate text-left">Settings</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSidebarCollapsed((c) => !c);
              setSuiteFlyout(null);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#c5c5c5] transition-colors hover:bg-[#1a1a1a] hover:text-[#c5c5c5]"
            title={sidebarCollapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
          >
            <IconChevronLeft className={`h-4 w-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
            {!sidebarCollapsed && <span className="truncate">{t('common.collapseSidebar')}</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="fixed left-0 right-0 top-0 z-[90] flex h-12 min-w-0 shrink-0 items-center gap-2 bg-[#101010] px-3 lg:px-5">
          <div
            className="flex min-w-0 shrink-0 items-center gap-2 overflow-hidden"
            style={{ width: Math.max(SIDEBAR_EXPANDED_PX, 220) }}
          >
            <Image
              src="/sasa.png"
              alt="SASA"
              width={100}
              height={33}
              className="h-7 w-auto max-w-[88px] shrink-0 object-contain invert"
              priority
            />
            <span className="min-w-0 truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-[#c5c5c5]">
              Business Hub
            </span>
          </div>
          <div className="min-w-0 flex-1 px-1 sm:px-2">
            <div ref={navSearchRef} className="relative z-[5] mx-auto w-full min-w-0 max-w-xl">
            <IconSearch className="pointer-events-none absolute left-6 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-[#c5c5c5]" />
            <input
              ref={navSearchInputRef}
              type="search"
              value={navSearchQuery}
              placeholder={t('common.searchPlaceholder')}
              autoComplete="off"
              aria-expanded={navSearchOpen}
              aria-controls="nav-search-results"
              aria-activedescendant={
                navSearchOpen && navSearchResults[navSearchHi] ? `nav-search-opt-${navSearchHi}` : undefined
              }
              onChange={(e) => {
                const v = e.target.value;
                setNavSearchQuery(v);
                setNavSearchHighlight(0);
                setNavSearchOpen(v.trim().length > 0);
              }}
              onFocus={() => {
                if (navSearchQuery.trim().length > 0) setNavSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setNavSearchOpen(false);
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (navSearchResults.length === 0) return;
                  setNavSearchOpen(true);
                  setNavSearchHighlight((h) => Math.min(h + 1, navSearchResults.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (navSearchResults.length === 0) return;
                  setNavSearchOpen(true);
                  setNavSearchHighlight((h) => Math.max(h - 1, 0));
                  return;
                }
                if (e.key === 'Enter') {
                  const pick = navSearchResults[navSearchHi];
                  if (pick) {
                    e.preventDefault();
                    applyNavSearch(pick);
                  }
                }
              }}
              className="h-8 w-full rounded-lg border border-gray-700 bg-[#252525] py-0 pl-12 pr-8 text-xs text-[#c5c5c5] placeholder:text-[#c5c5c5] focus:border-[#515151]/60 focus:outline-none focus:ring-1 focus:ring-[#515151]/30"
              aria-label={t('common.searchPlaceholder')}
            />

            {navSearchOpen && navSearchQueryNorm.length > 0 && (
              <div
                id="nav-search-results"
                className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-700 bg-[#252525] py-1 shadow-lg"
                role="listbox"
                aria-label={t('common.searchPlaceholder')}
              >
                {navSearchResults.length === 0 ? (
                  <p className="px-3 py-2.5 text-center text-xs text-gray-300">{t('common.searchNoResults')}</p>
                ) : (
                  navSearchResults.map((entry, idx) => (
                    <button
                      key={`${entry.tab}-${entry.path}-${idx}`}
                      type="button"
                      id={`nav-search-opt-${idx}`}
                      role="option"
                      aria-selected={idx === navSearchHi}
                      onMouseEnter={() => setNavSearchHighlight(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyNavSearch(entry)}
                      className={`flex w-full flex-col items-start gap-0.5 border-0 px-3 py-2 text-left transition-colors ${
                        idx === navSearchHi ? 'bg-[#303030]' : 'hover:bg-[#303030]'
                      }`}
                    >
                      <span className="text-xs font-semibold text-white">{entry.title}</span>
                      <span className="text-[10px] leading-snug text-gray-300">
                        <span className="font-medium text-gray-400">{t('common.searchLocation')}: </span>
                        {entry.path}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setDarkModeOn((v) => !v)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#c5c5c5] transition-colors hover:bg-[#1a1a1a]"
            aria-label={darkModeOn ? 'Turn dark mode off' : 'Turn dark mode on'}
            title={darkModeOn ? 'Dark mode on' : 'Dark mode off'}
          >
            {darkModeOn ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3c-.13.58-.21 1.19-.21 1.82A7.97 7.97 0 0019 12.79c.63 0 1.24-.08 1.82-.21Z" />
              </svg>
            )}
          </button>

          <div ref={userMenuRef} className="relative shrink-0">
            <button
              type="button"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setUserMenuOpen((o) => !o);
                setSuiteFlyout(null);
              }}
              className="flex max-w-[min(100vw-5rem,280px)] items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-[#1a1a1a]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1a1a1a] text-[#c5c5c5]">
                {(profileModalOpen ? profileForm.photoURL : profileSaved.photoURL) ? (
                  <img
                    src={profileModalOpen ? profileForm.photoURL : profileSaved.photoURL}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <IconUserOutline className="h-4 w-4" />
                )}
              </div>
              <div className="hidden min-w-0 items-center gap-2 sm:flex">
                <span className="truncate text-xs font-bold text-[#c5c5c5]">{displayName}</span>
                <span
                  className="shrink-0 rounded-md border border-gray-700 bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] font-semibold capitalize leading-none text-[#c5c5c5]"
                  title={user.role}
                >
                  {user.role}
                </span>
              </div>
              <IconChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-[#c5c5c5] transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {userMenuOpen && (
              <div
                className={`absolute right-0 top-full z-[70] mt-1 w-56 overflow-hidden rounded-lg py-1 shadow-lg ${
                  darkModeOn ? 'border border-gray-700 bg-[#101010]' : 'border border-gray-200 bg-white'
                }`}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileForm(profileSaved);
                    setProfilePhotoMenuOpen(false);
                    setProfileModalOpen(true);
                    setUserMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    darkModeOn ? 'text-[#c5c5c5] hover:bg-[#1a1a1a]' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A10.954 10.954 0 0112 15c2.5 0 4.847.816 6.879 2.196M15 9a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {t('common.profile')}
                </button>
                <div className={`my-1 border-t ${darkModeOn ? 'border-gray-700' : 'border-gray-200'}`} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    darkModeOn ? 'text-[#c5c5c5] hover:bg-[#1a1a1a]' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  {t('common.logout')}
                </button>
              </div>
            )}
          </div>
          </div>
        </header>

        <input
          ref={profilePhotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleProfilePhotoChange(e.target.files?.[0] ?? null)}
        />

        {profileModalOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
            <div
              className={`w-full max-w-md rounded-xl p-5 shadow-2xl ${
                darkModeOn ? 'border border-gray-700 bg-[#101010]' : 'border border-gray-200 bg-white'
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${darkModeOn ? 'text-white' : 'text-gray-900'}`}>Profile Settings</h3>
                <button
                  type="button"
                  onClick={() => {
                    setProfileForm(profileSaved);
                    setProfilePhotoMenuOpen(false);
                    setProfileModalOpen(false);
                    setProfileError('');
                  }}
                  className={`rounded p-1 ${darkModeOn ? 'text-gray-300 hover:bg-[#1a1a1a]' : 'text-gray-600 hover:bg-gray-100'}`}
                  aria-label="Close profile settings"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 flex items-center gap-3">
                <div ref={profilePhotoMenuRef} className="group relative">
                  <div className={`h-14 w-14 overflow-hidden rounded-full ${darkModeOn ? 'border border-gray-600 bg-[#1a1a1a]' : 'border border-gray-300 bg-gray-100'}`}>
                    {profileForm.photoURL ? (
                      <img src={profileForm.photoURL} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className={`flex h-full w-full items-center justify-center ${darkModeOn ? 'text-gray-300' : 'text-gray-500'}`}>
                        <IconUserOutline className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfilePhotoMenuOpen((v) => !v)}
                    className={`absolute bottom-0 right-0 rounded-full p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 ${
                      darkModeOn
                        ? 'border border-gray-600 bg-[#101010] text-gray-200 hover:bg-[#1a1a1a]'
                        : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                    aria-label="Photo options"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                    </svg>
                  </button>

                  {profilePhotoMenuOpen && (
                    <div
                      className={`absolute -right-2 top-16 z-10 w-44 overflow-hidden rounded-md shadow-lg ${
                        darkModeOn ? 'border border-gray-700 bg-[#101010]' : 'border border-gray-200 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setProfilePhotoMenuOpen(false);
                          profilePhotoInputRef.current?.click();
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                          darkModeOn ? 'text-gray-200 hover:bg-[#1a1a1a]' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l4-4a2 2 0 012.828 0L14 16m-1-1 1.586-1.586a2 2 0 012.828 0L21 17m-9-9h.01M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Choose new photo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileForm((prev) => ({ ...prev, photoURL: '' }));
                          setProfilePhotoMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                          darkModeOn ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 4v6m4-6v6m4-6v6M8 7h8l-1 13H9L8 7z" />
                        </svg>
                        Delete photo
                      </button>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${darkModeOn ? 'text-white' : 'text-gray-900'}`}>{displayName || user.name}</p>
                  <p className={`truncate text-xs ${darkModeOn ? 'text-gray-400' : 'text-gray-500'}`}>{user.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={`mb-1 block text-xs ${darkModeOn ? 'text-gray-300' : 'text-gray-700'}`}>First name</label>
                  <input
                    type="text"
                    value={profileForm.firstName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#515151] ${
                      darkModeOn
                        ? 'border border-gray-600 bg-[#1a1a1a] text-white'
                        : 'border border-gray-300 bg-white text-gray-900'
                    }`}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className={`mb-1 block text-xs ${darkModeOn ? 'text-gray-300' : 'text-gray-700'}`}>Last name</label>
                  <input
                    type="text"
                    value={profileForm.lastName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    className={`w-full rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#515151] ${
                      darkModeOn
                        ? 'border border-gray-600 bg-[#1a1a1a] text-white'
                        : 'border border-gray-300 bg-white text-gray-900'
                    }`}
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <label className={`mb-1 block text-xs ${darkModeOn ? 'text-gray-300' : 'text-gray-700'}`}>Email</label>
                  <input
                    type="email"
                    value={user.email}
                    readOnly
                    className={`w-full cursor-not-allowed rounded-lg px-3 py-2 text-sm ${
                      darkModeOn
                        ? 'border border-gray-700 bg-[#1a1a1a] text-gray-400'
                        : 'border border-gray-200 bg-gray-100 text-gray-500'
                    }`}
                  />
                </div>
              </div>

              {profileError && <p className="mt-3 text-xs text-red-400">{profileError}</p>}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProfileForm(profileSaved);
                    setProfilePhotoMenuOpen(false);
                    setProfileModalOpen(false);
                    setProfileError('');
                  }}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    darkModeOn
                      ? 'border-gray-600 text-gray-200 hover:bg-[#1a1a1a]'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={profileSaving}
                  onClick={saveProfile}
                  className="rounded-md bg-[#515151] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#626262] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {profileSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {photoCropOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
            <div
              className={`w-full max-w-md rounded-xl p-5 shadow-2xl ${
                darkModeOn ? 'border border-gray-700 bg-[#101010]' : 'border border-gray-200 bg-white'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${darkModeOn ? 'text-white' : 'text-gray-900'}`}>Adjust profile photo</h3>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoCropOpen(false);
                    setPhotoCropSrc('');
                    setPhotoCropDragging(false);
                  }}
                  className={`rounded p-1 ${darkModeOn ? 'text-gray-300 hover:bg-[#1a1a1a]' : 'text-gray-600 hover:bg-gray-100'}`}
                  aria-label="Close crop editor"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className={`mb-3 text-xs ${darkModeOn ? 'text-gray-400' : 'text-gray-500'}`}>Drag to position and use zoom to fit inside the frame.</div>
              <div
                className={`relative mx-auto overflow-hidden rounded-full ${
                  darkModeOn ? 'border border-gray-600 bg-[#1a1a1a]' : 'border border-gray-300 bg-gray-100'
                }`}
                style={{ width: PHOTO_FRAME_SIZE, height: PHOTO_FRAME_SIZE, cursor: photoCropDragging ? 'grabbing' : 'grab' }}
                onMouseDown={(e) => {
                  photoCropDragRef.current = {
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: photoCropOffset.x,
                    originY: photoCropOffset.y,
                  };
                  setPhotoCropDragging(true);
                }}
                onMouseMove={(e) => {
                  if (!photoCropDragging) return;
                  const dx = e.clientX - photoCropDragRef.current.startX;
                  const dy = e.clientY - photoCropDragRef.current.startY;
                  setPhotoCropOffset({ x: photoCropDragRef.current.originX + dx, y: photoCropDragRef.current.originY + dy });
                }}
                onMouseUp={() => setPhotoCropDragging(false)}
                onMouseLeave={() => setPhotoCropDragging(false)}
              >
                {photoCropSrc && (
                  <img
                    src={photoCropSrc}
                    alt="Crop preview"
                    draggable={false}
                    className="select-none"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: `translate(calc(-50% + ${photoCropOffset.x}px), calc(-50% + ${photoCropOffset.y}px)) scale(${photoCropZoom})`,
                      width: `${Math.max(PHOTO_FRAME_SIZE, (photoCropImageSize.width / photoCropImageSize.height) * PHOTO_FRAME_SIZE)}px`,
                      height: `${Math.max(PHOTO_FRAME_SIZE, (photoCropImageSize.height / photoCropImageSize.width) * PHOTO_FRAME_SIZE)}px`,
                      objectFit: 'cover',
                    }}
                  />
                )}
              </div>

              <div className="mt-4">
                <label className={`mb-1 block text-xs ${darkModeOn ? 'text-gray-300' : 'text-gray-700'}`}>Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={2.6}
                  step={0.01}
                  value={photoCropZoom}
                  onChange={(e) => setPhotoCropZoom(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoCropOpen(false);
                    setPhotoCropSrc('');
                    setPhotoCropDragging(false);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    darkModeOn
                      ? 'border-gray-600 text-gray-200 hover:bg-[#1a1a1a]'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={profileSaving}
                  onClick={uploadCroppedProfilePhoto}
                  className="rounded-md bg-[#515151] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#626262] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {profileSaving ? 'Uploading...' : 'Use photo'}
                </button>
              </div>
            </div>
          </div>
        )}

        <main
          className={`min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8 ${darkModeOn ? 'app-dark-main bg-black text-white' : ''}`}
        >
          <div
            className="mx-auto max-w-7xl"
            style={undefined}
          >
            {activeTab === 'dashboard' &&
              (user?.role !== 'marketing' || !SHOW_CMS_IN_NAVIGATION) && (
              <Dashboard
                onNavigate={(tab, filters) => {
                  setActiveTab(tab as Tab);
                  if (filters) {
                    sessionStorage.setItem(`dashboardFilters_${tab}`, JSON.stringify(filters));
                  }
                }}
              />
            )}
            {activeTab === 'suppliers' && hasPermission('suppliers.view') && <Suppliers />}
            {activeTab === 'purchase-orders' && hasPermission('purchase.view') && <PurchaseOrders />}
            {activeTab === 'inventory' &&
              (hasPermission('inventory.view') || hasPermission('inventory.view.ecuador')) && (
                <Inventory darkMode={darkModeOn} />
              )}
            {activeTab === 'landed-costs' && hasPermission('costs.view') && <LandedCosts />}
            {activeTab === 'cms' && SHOW_CMS_IN_NAVIGATION && hasPermission('cms.view') && <CMSModule />}
            {activeTab === 'clients' &&
              (hasPermission('clients.view') || hasPermission('clients.view.ecuador')) && <Clients />}
            {activeTab === 'sales' && hasPermission('sales.view') && <Sales />}
            {activeTab === 'sales-notes' && hasPermission('sales.view') && (
              <SalesNotesHistory onOpenInTracking={() => setActiveTab('invoice-tracking')} />
            )}
            {activeTab === 'invoice-tracking' && hasPermission('sales.view') && <InvoiceTracking />}
            {activeTab === 'consignments' &&
              (hasPermission('sales.view') || hasPermission('sales.create')) && <Consignments />}
            {activeTab === 'settings' && hasPermission('settings.view') && (
              <SettingsHub
                user={user}
                profileForm={profileForm}
                profileSaving={profileSaving}
                profileError={profileError}
                onProfileFieldChange={(field, value) => setProfileForm((prev) => ({ ...prev, [field]: value }))}
                onProfileChoosePhoto={() => profilePhotoInputRef.current?.click()}
                onProfileDeletePhoto={() => setProfileForm((prev) => ({ ...prev, photoURL: '' }))}
                onSaveProfile={saveProfile}
                onResetProfileDraft={resetProfileDraft}
                onChangePassword={changePasswordWithReauth}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Home() {
  return <AppContent />;
}
