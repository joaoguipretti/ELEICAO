import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// No `npm run dev`, atende /api/* com as funções da pasta api/ (no Vercel isso é automático).
function apiLocal() {
  return {
    name: 'api-local',
    configureServer(server) {
      server.middlewares.use('/api/', async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const arquivo = `/api${url.pathname.replace(/\/$/, '')}.js`;
        // Arquivos com "_" na frente são módulos internos, não rotas (igual ao Vercel).
        if (/\/_/.test(arquivo)) return next();
        let modulo;
        try {
          modulo = await server.ssrLoadModule(arquivo);
        } catch {
          return next();
        }
        const resposta = {
          status(codigo) {
            res.statusCode = codigo;
            return resposta;
          },
          setHeader: (nome, valor) => res.setHeader(nome, valor),
          json(corpo) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(corpo));
            return resposta;
          },
        };
        if (typeof modulo.default !== 'function') return next();
        await modulo.default({ query: Object.fromEntries(url.searchParams), method: req.method }, resposta);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Disponibiliza REDIS_URL e VITE_TURNO do .env.local para a função rodando localmente.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['REDIS_', 'VITE_']));
  return {
    plugins: [react(), tailwindcss(), apiLocal()],
  };
});
