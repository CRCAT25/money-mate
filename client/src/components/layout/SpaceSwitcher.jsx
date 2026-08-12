import { Check, ChevronDown, Home, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../ui/Modal.jsx';

export default function SpaceSwitcher({ compact = false }) {
  const { family: activeSpace } = useAuth();
  const [open, setOpen] = useState(false);
  if (!activeSpace) return null;
  const Icon = activeSpace.type === 'personal' ? UserRound : Home;

  return (
    <>
      <button
        type="button"
        className={`inline-flex touch-manipulation items-center gap-2 rounded-xl border border-ink/[0.07] bg-paper/85 text-ink shadow-sm backdrop-blur-xl transition active:scale-[0.98] ${compact ? 'min-h-8 px-2.5 text-[11px]' : 'min-h-9 px-3 text-xs'}`}
        onClick={() => setOpen(true)}
        aria-label="Chuyển không gian"
      >
        <span className={`grid place-items-center rounded-lg ${activeSpace.type === 'personal' ? 'bg-sun/25 text-[#9A752E]' : 'bg-mint text-forest'} ${compact ? 'size-6' : 'size-7'}`}>
          <Icon className="size-3.5" />
        </span>
        <span className="max-w-28 truncate font-medium">{activeSpace.type === 'personal' ? 'Cá nhân' : activeSpace.name}</span>
        <ChevronDown className="size-3.5 text-ink/38" />
      </button>

      <SpaceSelectionModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function SpaceSelectionModal({ open, onClose }) {
  const { family: activeSpace, spaces, selectSpace } = useAuth();
  return (
    <Modal open={open} title="Chọn không gian" onClose={onClose} compact>
      <div className="space-y-2">
        {spaces.map((space) => {
          const ItemIcon = space.type === 'personal' ? UserRound : Home;
          const active = space.id === activeSpace?.id;
          return (
            <button
              type="button"
              key={space.id}
              className={`flex min-h-[62px] w-full items-center gap-3 rounded-[15px] border px-3.5 text-left transition active:scale-[0.985] ${active ? 'border-forest/20 bg-mint/55' : 'border-ink/[0.07] bg-white/65'}`}
              onClick={() => { selectSpace(space.id); onClose(); }}
            >
              <span className={`grid size-10 place-items-center rounded-xl ${space.type === 'personal' ? 'bg-sun/25 text-[#9A752E]' : 'bg-mint text-forest'}`}><ItemIcon className="size-[18px]" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{space.type === 'personal' ? 'Cá nhân' : space.name}</span><span className="mt-0.5 block text-[11px] text-ink/42">{space.type === 'personal' ? 'Chỉ mình bạn nhìn thấy' : 'Dùng chung với gia đình'}</span></span>
              {active && <Check className="size-4 text-forest" strokeWidth={2.5} />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
