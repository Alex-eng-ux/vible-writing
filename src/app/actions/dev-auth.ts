// Dev-only server action: log in as a display name.
//
// Equivalent to POST /api/auth/dev-login but exposed as a Next.js Server
// Action so it can be used directly from a `<form action={...}>` in a
// server component. Production builds must wire in a real auth provider
// (NextAuth, Lucia, etc.) and remove this file.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getOrCreateDevUser, getOrCreateProductionGuestUser, signInAs, signOut } from '@/lib/auth';

export async function devSignInAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const user = await getOrCreateDevUser(name);
  signInAs(user.id);
  revalidatePath('/');
  redirect('/');
}

export async function productionGuestSignInAction() {
  const user = await getOrCreateProductionGuestUser();
  signInAs(user.id);
  revalidatePath('/');
  redirect('/');
}

export async function devSignOutAction() {
  signOut();
  revalidatePath('/');
  redirect('/');
}
