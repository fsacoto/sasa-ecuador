import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { AutoconsumoNote } from '../types';

export const AUTOCONSUMO_COLLECTION = 'autoconsumo';

function mapDoc(id: string, data: Record<string, unknown>): AutoconsumoNote {
  let noteDate: Date;
  let createdDate: Date;
  try {
    noteDate =
      (data.date as { toDate?: () => Date })?.toDate?.() ||
      (data.date instanceof Date ? data.date : new Date());
    createdDate =
      (data.createdAt as { toDate?: () => Date })?.toDate?.() ||
      (data.createdAt instanceof Date ? data.createdAt : new Date());
  } catch {
    noteDate = new Date();
    createdDate = new Date();
  }

  return {
    id,
    noteNumber: String(data.noteNumber || ''),
    recipient: String(data.recipient || ''),
    items: Array.isArray(data.items) ? (data.items as AutoconsumoNote['items']) : [],
    totalCost: Number(data.totalCost) || 0,
    date: noteDate,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    createdAt: createdDate,
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
  };
}

export async function getAllAutoconsumoNotes(filters?: {
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<AutoconsumoNote[]> {
  try {
    const q = query(collection(db, AUTOCONSUMO_COLLECTION));
    const snapshot = await getDocs(q);
    let notes = snapshot.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));

    if (filters?.dateFrom) {
      notes = notes.filter((n) => n.date >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      notes = notes.filter((n) => n.date <= filters.dateTo!);
    }

    notes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return notes;
  } catch (error) {
    console.error('Error fetching autoconsumo notes:', error);
    throw error;
  }
}

export async function getAutoconsumoNote(noteId: string): Promise<AutoconsumoNote | null> {
  try {
    const docSnap = await getDoc(doc(db, AUTOCONSUMO_COLLECTION, noteId));
    if (!docSnap.exists()) return null;
    return mapDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
  } catch (error) {
    console.error('Error fetching autoconsumo note:', error);
    throw error;
  }
}

function extractAutoconsumoSequence(noteNumber: unknown): number | null {
  if (typeof noteNumber !== 'string') return null;
  const m = noteNumber.match(/^AUTO-(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : n;
}

export async function getNextAutoconsumoNumber(): Promise<string> {
  try {
    const snapshot = await getDocs(query(collection(db, AUTOCONSUMO_COLLECTION)));
    if (snapshot.empty) return 'AUTO-001';

    let lastNumber = 0;
    snapshot.docs.forEach((d) => {
      const n = extractAutoconsumoSequence(d.data().noteNumber);
      if (n !== null && n > lastNumber) lastNumber = n;
    });

    return `AUTO-${String(lastNumber + 1).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating autoconsumo number:', error);
    return `AUTO-${Date.now().toString().slice(-3)}`;
  }
}

export async function createAutoconsumoNote(
  note: Omit<AutoconsumoNote, 'id' | 'createdAt'>
): Promise<AutoconsumoNote> {
  try {
    const docRef = doc(collection(db, AUTOCONSUMO_COLLECTION));

    let noteNumber = note.noteNumber;
    const validSeq = typeof noteNumber === 'string' && /^AUTO-\d+$/i.test(noteNumber);
    if (!noteNumber || noteNumber === 'TEMP' || !validSeq) {
      noteNumber = await getNextAutoconsumoNumber();
    }

    const newNote: Omit<AutoconsumoNote, 'id'> = {
      ...note,
      noteNumber,
      createdAt: new Date(),
    };

    Object.keys(newNote).forEach((key) => {
      if ((newNote as Record<string, unknown>)[key] === undefined) {
        delete (newNote as Record<string, unknown>)[key];
      }
    });

    await setDoc(docRef, newNote);

    return { id: docRef.id, ...newNote };
  } catch (error) {
    console.error('Error creating autoconsumo note:', error);
    throw error;
  }
}

export async function updateAutoconsumoNote(
  noteId: string,
  updates: Partial<AutoconsumoNote>
): Promise<void> {
  try {
    const cleanUpdates: Partial<AutoconsumoNote> = { ...updates };
    Object.keys(cleanUpdates).forEach((key) => {
      if ((cleanUpdates as Record<string, unknown>)[key] === undefined) {
        delete (cleanUpdates as Record<string, unknown>)[key];
      }
    });
    await setDoc(doc(db, AUTOCONSUMO_COLLECTION, noteId), cleanUpdates, { merge: true });
  } catch (error) {
    console.error('Error updating autoconsumo note:', error);
    throw error;
  }
}

export async function deleteAutoconsumoNote(noteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, AUTOCONSUMO_COLLECTION, noteId));
  } catch (error) {
    console.error('Error deleting autoconsumo note:', error);
    throw error;
  }
}
