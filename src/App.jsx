import { useEffect, useState } from 'react';
import { buscarResultados } from './tse.js';
import './App.css';

const CARGOS = [
  { id: 'presidente', nome: 'Presidente', porUf: false, maioria: true, companheiros: 'Vice' },
  { id: 'governador', nome: 'Governador', porUf: true, maioria: true, companheiros: 'Vice' },
  { id: 'senador', nome: 'Senador', porUf: true, maioria: false, companheiros: 'Suplentes' },
];

const UFS = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const INTERVALO_SEGUNDOS = 30;

const numero = new Intl.NumberFormat('pt-BR');
const pct = (valor) =>
  `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export default function App() {
  const [cargoId, setCargoId] = useState('presidente');
  const [uf, setUf] = useState('SP');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  const cargo = CARGOS.find((c) => c.id === cargoId);

  // Busca os resultados e repete a cada 30s enquanto o cargo/UF não mudar.
  // Com a aba em segundo plano para de buscar; ao voltar, atualiza na hora.
  useEffect(() => {
    const controle = new AbortController();
    const { porUf } = CARGOS.find((c) => c.id === cargoId);
    let timer;
    let buscando = false;

    async function carregar() {
      clearTimeout(timer);
      buscando = true;
      try {
        setDados(await buscarResultados(cargoId, porUf ? uf : null, controle.signal));
        setErro(null);
      } catch (e) {
        if (e.name !== 'AbortError') setErro(e.message);
      } finally {
        buscando = false;
        if (!controle.signal.aborted && !document.hidden) {
          timer = setTimeout(carregar, INTERVALO_SEGUNDOS * 1000);
        }
      }
    }

    function aoMudarVisibilidade() {
      if (document.hidden) clearTimeout(timer);
      else if (!buscando) carregar();
    }

    setDados(null);
    setErro(null);
    carregar();
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      controle.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [cargoId, uf]);

  const apuracaoComecou = dados && dados.secoes.totalizadas > 0;

  return (
    <div className="pagina">
      <header className="topo">
        <div>
          <h1>Apuração 2026</h1>
          <p className="subtitulo">Eleições Gerais · 1º turno · 4 de outubro</p>
        </div>
        <div className="topo-acoes">
          <span className="ao-vivo">
            <span className="ponto" aria-hidden="true" /> Atualiza a cada {INTERVALO_SEGUNDOS}s
          </span>
          <BotaoTema />
        </div>
      </header>

      <nav className="filtros" aria-label="Filtros">
        <div className="abas" role="tablist">
          {CARGOS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === cargoId}
              className={c.id === cargoId ? 'aba ativa' : 'aba'}
              onClick={() => setCargoId(c.id)}
            >
              {c.nome}
            </button>
          ))}
        </div>
        {cargo.porUf && (
          <select value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado">
            {Object.entries(UFS).map(([sigla, nome]) => (
              <option key={sigla} value={sigla}>
                {nome}
              </option>
            ))}
          </select>
        )}
      </nav>

      {erro && <div className="aviso erro">⚠ {erro}</div>}
      {!dados && !erro && <div className="aviso">Carregando dados do TSE…</div>}

      {dados && (
        <>
          <section className="progresso">
            <div className="progresso-numero">{pct(dados.secoes.percentual)}</div>
            <div className="progresso-texto">
              <span>das seções totalizadas</span>
              <span className="mudo">
                {numero.format(dados.secoes.totalizadas)} de {numero.format(dados.secoes.total)}
                {dados.atualizadoEm && ` · TSE ${dados.atualizadoEm}`}
              </span>
            </div>
            <div
              className="medidor"
              role="progressbar"
              aria-valuenow={dados.secoes.percentual}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: `${dados.secoes.percentual}%` }} />
            </div>
          </section>

          {!apuracaoComecou && (
            <div className="aviso">
              A apuração começa depois que as urnas fecham, às 17h (horário de Brasília). Até lá os
              candidatos aparecem em ordem alfabética.
            </div>
          )}

          <section>
            <div className="lista-cabecalho">
              <h2>
                {dados.cargo}
                {cargo.porUf && ` · ${UFS[uf]}`}
              </h2>
              <span className="mudo">
                {cargo.maioria
                  ? 'A linha marca 50% dos válidos: acima disso, vence no 1º turno'
                  : `${dados.vagas} ${dados.vagas > 1 ? 'vagas' : 'vaga'} em disputa · os mais votados são eleitos`}
              </span>
            </div>
            <ol className="candidatos">
              {dados.candidatos.map((c, i) => (
                <Candidato
                  key={c.numero}
                  candidato={c}
                  posicao={apuracaoComecou ? i + 1 : null}
                  lider={apuracaoComecou && i === 0}
                  cargo={cargo}
                />
              ))}
            </ol>
          </section>

          <section className="estatisticas">
            <Estatistica titulo="Comparecimento" valor={dados.eleitorado.comparecimento} percentual={dados.eleitorado.percentualComparecimento} />
            <Estatistica titulo="Abstenção" valor={dados.eleitorado.abstencao} percentual={dados.eleitorado.percentualAbstencao} />
            <Estatistica titulo="Votos válidos" valor={dados.votos.validos} percentual={dados.votos.percentualValidos} />
            <Estatistica titulo="Brancos" valor={dados.votos.brancos} percentual={dados.votos.percentualBrancos} />
            <Estatistica titulo="Nulos" valor={dados.votos.nulos} percentual={dados.votos.percentualNulos} />
            <Estatistica titulo="Eleitorado" valor={dados.eleitorado.total} />
          </section>
        </>
      )}

      <footer className="rodape mudo">
        Fonte: Tribunal Superior Eleitoral —{' '}
        <a href="https://resultados.tse.jus.br" target="_blank" rel="noreferrer">
          resultados.tse.jus.br
        </a>
        . Percentuais calculados sobre os votos válidos.
      </footer>
    </div>
  );
}

function BotaoTema() {
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme || 'light');
  const proximo = tema === 'dark' ? 'light' : 'dark';
  const rotulo = proximo === 'dark' ? 'Mudar para tema escuro' : 'Mudar para tema claro';

  function alternar() {
    document.documentElement.dataset.theme = proximo;
    setTema(proximo);
    try {
      localStorage.setItem('tema', proximo);
    } catch {
      // Sem localStorage (aba anônima, etc.): o tema só não fica salvo.
    }
  }

  return (
    <button className="botao-tema" onClick={alternar} aria-label={rotulo} title={rotulo}>
      {tema === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function Candidato({ candidato: c, posicao, lider, cargo }) {
  return (
    <li className={lider ? 'candidato lider' : 'candidato'}>
      <span className="posicao">{posicao && `${posicao}º`}</span>
      <img
        className="foto"
        src={c.foto}
        alt=""
        loading="lazy"
        onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
      />
      <div className="info">
        <div className="nome">
          <strong>{c.nome}</strong>
          <span className="mudo">
            {c.partido} · {c.numero}
          </span>
          {c.eleito && <span className="selo eleito">✓ Eleito</span>}
          {!c.eleito && c.situacao && <span className="selo">{c.situacao}</span>}
          {lider && !c.situacao && <span className="selo">Lidera</span>}
          {c.votosAnulados && (
            <span className="selo alerta">⚠ {c.votosAnulados.replace(/^anulado/i, 'Votos anulados')}</span>
          )}
        </div>
        {c.companheiros.length > 0 && (
          <div className="companheiros mudo">
            {cargo.companheiros}: {c.companheiros.join(', ')}
          </div>
        )}
        <div className="barra" title={`${c.nome}: ${numero.format(c.votos)} votos (${pct(c.percentual)})`}>
          <div className="preenchimento" style={{ width: `${c.percentual}%` }} />
          {cargo.maioria && <div className="marca-maioria" />}
        </div>
      </div>
      <div className="numeros">
        <strong>{pct(c.percentual)}</strong>
        <span className="mudo">{numero.format(c.votos)} votos</span>
      </div>
    </li>
  );
}

function Estatistica({ titulo, valor, percentual }) {
  return (
    <div className="estatistica">
      <span className="mudo">{titulo}</span>
      <strong>{numero.format(valor)}</strong>
      {percentual !== undefined && <span className="mudo">{pct(percentual)}</span>}
    </div>
  );
}
