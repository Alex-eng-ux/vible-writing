'use server';

import { revalidatePath } from 'next/cache';
import {
  clearServerAIConfig,
  getAIConfigSummary,
  saveServerAIConfig,
} from '@/lib/ai/config';

export async function getAISettingsAction() {
  return getAIConfigSummary();
}

export async function saveAISettingsAction(formData: FormData) {
  const apiKey = String(formData.get('apiKey') || '');
  const baseUrl = String(formData.get('baseUrl') || '');
  const model = String(formData.get('model') || '');
  const config = await saveServerAIConfig({ apiKey, baseUrl, model });
  revalidatePath('/');
  revalidatePath('/settings/ai');
  return { ok: true, config };
}

export async function clearAISettingsAction() {
  await clearServerAIConfig();
  revalidatePath('/');
  revalidatePath('/settings/ai');
  return { ok: true };
}
