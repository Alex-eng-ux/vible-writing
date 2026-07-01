import AISettingsForm from '@/components/AISettingsForm';
import { getAISettingsAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function AISettingsPage() {
  const settings = await getAISettingsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">AI 设置</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">
          在这里为项目接入真实的大模型 API。保存后，服务端的所有 AI 能力都会使用这份配置。
        </p>
      </div>
      <AISettingsForm initial={settings} />
    </div>
  );
}
