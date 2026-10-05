// Um ponto = uma geração do TSE para uma abrangência (Brasil, um estado, o exterior).
// Usado no navegador (ao vivo) e na função do servidor (api/historico.js), que grava no Redis.
export function criarPonto(dados) {
  return {
    t: dados.geradoEm,
    apuradas: dados.secoes.percentual,
    secoes: dados.secoes.totalizadas,
    secoesTotal: dados.secoes.total,
    faltam: dados.eleitorado.faltam,
    eleitorado: dados.eleitorado.total,
    comparecimento: dados.eleitorado.percentualComparecimento,
    brancosNulos: dados.votos.percentualBrancos + dados.votos.percentualNulos,
    validos: dados.votos.validos,
    percentuais: Object.fromEntries(dados.candidatos.map((c) => [c.numero, c.percentual])),
    votos: Object.fromEntries(dados.candidatos.map((c) => [c.numero, c.votos])),
  };
}
