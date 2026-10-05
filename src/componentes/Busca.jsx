import { useEffect, useRef, useState } from 'react';
import Foto from './Foto.jsx';
import { IconeBusca, IconeFechar } from './Icones.jsx';
import { nomeProprio, siglaPartido } from '../lib/formato.js';

const semAcento = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Busca (Ctrl+K): estados e candidatos. Escolher um leva direto para ele.
export default function Busca({ itens, onEscolher, onFechar }) {
  const [termo, setTermo] = useState('');
  const [ativo, setAtivo] = useState(0);
  const campo = useRef(null);

  useEffect(() => campo.current?.focus(), []);

  const t = semAcento(termo.trim());
  const resultados = (t ? itens.filter((i) => semAcento(i.busca).includes(t)) : itens).slice(0, 8);

  function teclas(e) {
    if (e.key === 'Escape') onFechar();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAtivo((a) => Math.min(resultados.length - 1, a + 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(0, a - 1));
    }
    if (e.key === 'Enter' && resultados[ativo]) onEscolher(resultados[ativo]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onClick={onFechar}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-borda bg-painel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-borda px-4">
          <IconeBusca className="text-texto-2" />
          <input
            ref={campo}
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value);
              setAtivo(0);
            }}
            onKeyDown={teclas}
            placeholder="Buscar um estado ou cidade"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-texto-3"
            aria-label="Buscar um estado ou cidade"
          />
          <button onClick={onFechar} className="text-texto-2 hover:text-texto" aria-label="Fechar">
            <IconeFechar />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {resultados.length === 0 && <li className="px-3 py-6 text-center text-sm text-texto-2">Nada encontrado</li>}
          {resultados.map((item, i) => (
            <li key={item.chave}>
              <button
                onMouseEnter={() => setAtivo(i)}
                onClick={() => onEscolher(item)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                  i === ativo ? 'bg-painel-2' : ''
                }`}
              >
                {item.candidato ? (
                  <Foto candidato={item.candidato} tamanho={28} />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded bg-painel-2 text-[10px] font-bold">
                    {item.sigla}
                  </span>
                )}
                <span className="flex-1">
                  {item.candidato ? nomeProprio(item.candidato.nome) : item.titulo}
                </span>
                <span className="text-xs text-texto-2">
                  {item.candidato ? `${siglaPartido(item.candidato.partido)} · ${item.contexto}` : item.contexto}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
