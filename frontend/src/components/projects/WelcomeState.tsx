import { Sparkles, Command, FolderOpen, Zap } from 'lucide-react';
import { Kbd } from '../ui/Kbd';

export function WelcomeState({ projectCount, onOpenPalette }: { projectCount: number; onOpenPalette: () => void }) {
  return (
    <div className="h-full flex items-center justify-center px-8 anim-fade">
      <div className="max-w-xl w-full text-center">
        <div className="inline-flex size-14 rounded-2xl bg-gradient-to-br from-[var(--color-brand-500)] to-[var(--color-cyan-500)] items-center justify-center shadow-2xl shadow-[var(--color-brand-500)]/30 mb-6">
          <Sparkles size={26} className="text-white" />
        </div>
        <h2 className="text-3xl font-semibold tracking-tight">
          Welcome to <span className="text-gradient">DevControl</span>
        </h2>
        <p className="mt-2 text-[var(--color-text-3)]">
          {projectCount} project{projectCount === 1 ? '' : 's'} discovered. Pick one from the sidebar to start.
        </p>

        <button
          onClick={onOpenPalette}
          className="mt-6 inline-flex items-center gap-3 h-11 px-4 rounded-xl bg-[var(--color-bg-2)] border border-[var(--color-line)] hover:border-[var(--color-line-strong)] transition group"
        >
          <Command size={16} className="text-[var(--color-brand-300)]" />
          <span className="text-sm text-[var(--color-text-2)]">Open command palette</span>
          <span className="flex items-center gap-1 ml-2"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <FeatureCard
            icon={<FolderOpen size={16} />}
            title="Auto-discovered"
            text="Scans your workspace for .NET, Node, Docker projects automatically."
          />
          <FeatureCard
            icon={<Zap size={16} />}
            title="One-click actions"
            text="Run, stop, restart anything. Persistent logs, smart ready detection."
          />
          <FeatureCard
            icon={<Sparkles size={16} />}
            title="Live everything"
            text="WebSocket-powered logs, system stats, port watchers, healthchecks."
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="surface-2 p-4">
      <div className="size-8 rounded-md bg-[var(--color-brand-500)]/15 text-[var(--color-brand-300)] flex items-center justify-center mb-2">
        {icon}
      </div>
      <div className="text-sm font-medium text-[var(--color-text-1)]">{title}</div>
      <div className="mt-1 text-xs text-[var(--color-text-3)] leading-relaxed">{text}</div>
    </div>
  );
}
