# stackblitz-Mini-fooball
# Mini Soccer (Vite + Supabase)

Futebol 2D visto de cima, multiplayer, com lobbies de 2x2, 3x3, 4x4 e 5x5.

## Recursos
- **Autenticação (Supabase Auth):** cadastro com apelido, login, logout e sessão.
- **Lobbies em tempo real:** lista, sala e trocas de time atualizam sozinhas (Realtime postgres_changes).
- **Partida:** roda no navegador do host, que simula a física e envia o estado aos outros por Realtime Broadcast.
- **Bots:** opção de completar as vagas com bots.
- **Capitão:** quem entrou primeiro em cada time. Usa uma faixa preta na diagonal e pode passar a braçadeira a alguém do time.
- **Personalização:** boneco (pele, cabelo, estilo, número) e time (nome, 2 cores, estampa). O dono do lobby escolhe campo, bola e quem define as cores: ele mesmo ou os capitães.
- **Scoreboard:** ao fim da partida, tabela com gols, assistências, chutes e nota de 0 a 10,0.

## Controles
WASD ou setas para mover, Espaço para chutar.
[Edit in StackBlitz next generation editor ⚡️](https://stackblitz.com/~/github.com/jrn109588/stackblitz-Mini-fooball)