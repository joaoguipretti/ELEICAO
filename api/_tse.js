// Regras para o servidor não sobrecarregar o TSE. Se o TSE responder 429 ("muitas
// requisições"), todas as coletas do servidor param por alguns minutos.
export const CHAVE_PAUSA = 'tse:pausa';
const PAUSA_SEGUNDOS = 300;

export async function emPausa(cliente) {
  return (await cliente.exists(CHAVE_PAUSA)) === 1;
}

export async function pausar(cliente) {
  await cliente.set(CHAVE_PAUSA, '1', { EX: PAUSA_SEGUNDOS });
  console.warn(`[tse] o TSE respondeu 429: coletas pausadas por ${PAUSA_SEGUNDOS / 60} minutos`);
}
