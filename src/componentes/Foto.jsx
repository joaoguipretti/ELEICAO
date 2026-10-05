import { useState } from 'react';
import { corPartido } from '../lib/cores.js';

// Foto do candidato (vem do TSE); se não carregar, mostra as iniciais na cor do partido.
export default function Foto({ candidato, tamanho = 32, className = '', borda = false }) {
  const [falhou, setFalhou] = useState(false);
  const cor = corPartido(candidato.partido);
  const iniciais = candidato.nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-painel-2 ${className}`}
      style={{
        width: tamanho,
        height: tamanho,
        boxShadow: borda ? `0 0 0 2px ${cor}` : undefined,
      }}
    >
      {falhou || !candidato.foto ? (
        <span className="text-[10px] font-semibold" style={{ color: cor }}>
          {iniciais}
        </span>
      ) : (
        <img
          src={candidato.foto}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover object-top"
          onError={() => setFalhou(true)}
        />
      )}
    </span>
  );
}
