# Mini Soccer

Futebol multiplayer no navegador (Vite + Supabase Realtime). A simulação roda no computador do host; os demais jogadores enviam inputs e recebem o estado.

## Banco (Supabase)
- Projeto novo: rode `supabase/schema.sql` no SQL Editor.
- Já tinha rodado o `schema.sql` antigo: rode `update-v2.sql` e depois `update-v3.sql` (remove a personalização do jogador e cria o ranking).
- Em **Authentication > URL Configuration**, coloque a URL pública do app (ex.: `https://app.<IP>.nip.io`) em *Site URL* e *Redirect URLs*.

## Desenvolvimento
```bash
cp .env.example .env   # preencha URL e anon key do Supabase
npm install
npm run dev
npm test               # testes da simulação (mesmos do CI)
```

## Deploy (roteiro da OCI: Docker + Portainer + NPM + GitHub Actions)
1. **Secrets no GitHub** (Settings > Secrets > Actions): `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (usados no build de validação do CI).
2. **Portainer > Stacks > Add stack > Repository**: URL do repo, `refs/heads/main`, compose path `docker-compose.yml`, *Automatic updates* ligado.
   Em **Environment variables** da stack, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (a anon key é pública por design; o acesso é protegido pelo RLS).
3. A rede `proxy-net` já existe (criada pela stack base do roteiro).
4. **Nginx Proxy Manager > Proxy Hosts**: domínio `app.<IP_PUBLICO>.nip.io`, scheme `http`, host `aula-pratica-nuvem`, porta `8080`, *Block Common Exploits*; aba SSL: Let's Encrypt + Force SSL.

As variáveis `VITE_*` são embutidas no build: ao trocá-las, faça um novo deploy (rebuild) da stack.
Healthcheck do container: `GET /healthz`.

## Observações
- Node 22: o `@supabase/supabase-js` do lockfile exige Node >= 22 (o roteiro usava 18).
- Se o host sair, a partida termina para todos (a simulação roda nele). Se outro jogador sair, um bot assume com o nome `Bot (nome)`.
