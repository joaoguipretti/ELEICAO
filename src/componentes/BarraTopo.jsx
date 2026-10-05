import { useState } from 'react';
import { IconeBaixar, IconeBusca, IconeLua, IconeSol } from './Icones.jsx';

function BotaoTema() {
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme || 'dark');
  const proximo = tema === 'dark' ? 'light' : 'dark';
  const rotulo = proximo === 'light' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
  function alternar() {
    document.documentElement.dataset.theme = proximo;
    setTema(proximo);
    window.dispatchEvent(new Event('tema'));
    try {
      localStorage.setItem('tema', proximo);
    } catch {
      // Sem localStorage: o tema só não fica salvo.
    }
  }
  return (
    <button onClick={alternar} className="rounded-lg p-2 text-texto-2 hover:bg-painel-2 hover:text-texto" aria-label={rotulo} title={rotulo}>
      {tema === 'dark' ? <IconeSol width={18} height={18} /> : <IconeLua width={18} height={18} />}
    </button>
  );
}

export default function BarraTopo({ selo, abas, cargo, onCargo, onBuscar, onBaixar }) {
  return (
    <header className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-borda px-5 py-2.5 lg:grid-cols-[1fr_auto_1fr]">
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-semibold tracking-tight">Apuração 2026</span>
        <span className="rounded-md border border-dashed border-borda px-2 py-0.5 text-xs text-texto-2">{selo}</span>
      </div>

      <nav className="order-3 col-span-2 flex justify-center gap-6 lg:order-none lg:col-span-1" aria-label="Cargo">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => onCargo(a.id)}
            aria-pressed={cargo === a.id}
            className={`relative py-2 text-sm transition-colors ${
              cargo === a.id
                ? 'font-semibold text-texto after:absolute after:inset-x-0 after:-bottom-[11px] after:h-0.5 after:rounded after:bg-texto'
                : 'text-texto-2 hover:text-texto'
            }`}
          >
            {a.nome}
          </button>
        ))}
      </nav>

      <div className="flex items-center justify-end gap-1">
        <button
          onClick={onBuscar}
          className="mr-1 flex w-56 items-center gap-2 rounded-lg border border-borda bg-painel px-3 py-1.5 text-sm text-texto-3 hover:text-texto-2 max-sm:w-auto"
        >
          <IconeBusca />
          <span className="flex-1 text-left max-sm:hidden">Buscar um lugar</span>
          <kbd className="rounded border border-borda px-1.5 text-[10px] max-sm:hidden">/</kbd>
        </button>
        <BotaoTema />
        <button
          onClick={onBaixar}
          className="rounded-lg p-2 text-texto-2 hover:bg-painel-2 hover:text-texto"
          aria-label="Baixar os resultados (CSV)"
          title="Baixar os resultados (CSV)"
        >
          <IconeBaixar width={18} height={18} />
        </button>
      </div>
    </header>
  );
}
