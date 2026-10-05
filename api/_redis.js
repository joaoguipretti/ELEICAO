// Conexão com o Redis compartilhada pelas funções da pasta api/ (arquivos com "_" na frente
// não viram rota no Vercel). A conexão é reaproveitada enquanto a função estiver "quente".
import { createClient } from 'redis';

let conexao;

export function redis() {
  conexao ??= createClient({ url: process.env.REDIS_URL })
    .on('error', (erro) => console.error('[redis]', erro.message))
    .connect()
    .catch((erro) => {
      conexao = null;
      throw erro;
    });
  return conexao;
}
