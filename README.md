# SHADOWHOUSE — Multiplayer Setup
## A Vingança de Kauan | Real-Time Multiplayer

---

## 📁 Estrutura de arquivos

```
shadowhouse-multiplayer/
├── server.js          ← Servidor Node.js + Socket.IO
├── package.json       ← Dependências
├── README.md          ← Este arquivo
└── public/
    └── index.html     ← Jogo cliente (abre no browser)
```

---

## 🚀 Como rodar

### 1. Instalar Node.js
Baixe em https://nodejs.org (versão 18 ou superior)

### 2. Instalar dependências
```bash
cd shadowhouse-multiplayer
npm install
```

### 3. Iniciar o servidor
```bash
npm start
```
Você verá:
```
╔══════════════════════════════════════════╗
║  SHADOWHOUSE — Servidor Multiplayer      ║
║  http://localhost:3000                   ║
╚══════════════════════════════════════════╝
```

### 4. Abrir o jogo
Todos os jogadores abrem no browser:
```
http://localhost:3000
```

Para jogar em rede local (LAN), outros computadores usam:
```
http://SEU_IP_LOCAL:3000
```
(ex: `http://192.168.1.10:3000`)

Para descobrir seu IP local:
- Windows: `ipconfig` no terminal
- Mac/Linux: `ifconfig` ou `ip addr`

---

## 🌐 Hospedagem online (opcional)

Para jogar com amigos pela internet, hospede o servidor em:

### Railway (grátis, fácil)
1. Crie conta em https://railway.app
2. "New Project" → "Deploy from GitHub"
3. Envie a pasta do projeto para um repositório GitHub
4. Railway detecta o `package.json` automaticamente
5. Compartilhe a URL gerada com seus amigos

### Render (grátis)
1. Crie conta em https://render.com
2. "New Web Service" → conecte seu repositório
3. Build Command: `npm install`
4. Start Command: `npm start`

### Variável de ambiente — PORT
O servidor usa `process.env.PORT || 3000`. Plataformas como Railway/Render definem `PORT` automaticamente.

---

## 🎮 Sistema Multiplayer — Como funciona

### Conexão
- Ao iniciar uma partida (solo ou lobby), o cliente conecta automaticamente ao servidor via Socket.IO
- Se o servidor estiver offline, o jogo funciona normalmente no modo solo

### Sincronização
- Posição (x, z) e rotação (yaw) são enviadas ao servidor a **20x por segundo**
- O servidor retransmite para todos os outros jogadores
- Interpolação suave (lerp) elimina o jitter de rede

### Jogadores remotos
- Cada jogador aparece como um personagem 3D com a cor da skin escolhida
- O nome flutua acima do personagem
- Animação de caminhada em tempo real

### Eventos em tempo real
- Jogador entra → notificação + personagem spawna
- Jogador sai → personagem some + notificação
- Jogador capturado por Kauan → personagem fica vermelho + desaparece
- Chat via `socket.emit('chat:msg', texto)` no console do browser

---

## ⚙️ Configurações

### Mudar a porta
```bash
PORT=8080 npm start
# ou no Windows:
set PORT=8080 && npm start
```

### Máximo de jogadores por sessão
Edite `server.js` — atualmente não há limite (defina conforme precisar):
```js
// Adicione esta verificação no evento 'player:join':
if (Object.keys(players).length >= 8) {
  socket.emit('server:full');
  socket.disconnect();
  return;
}
```

---

## 🔧 Eventos Socket.IO disponíveis

| Evento (cliente → servidor) | Dados | Descrição |
|---|---|---|
| `player:join` | `{ name, skinId }` | Entrar na sessão |
| `player:move` | `{ x, z, yaw }` | Enviar posição |
| `player:captured` | — | Notificar captura por Kauan |
| `chat:msg` | `string` | Enviar mensagem no chat |

| Evento (servidor → cliente) | Dados | Descrição |
|---|---|---|
| `player:init` | `{ selfId, players[] }` | Estado inicial da sessão |
| `player:joined` | `player` | Novo jogador entrou |
| `player:moved` | `{ id, x, z, yaw }` | Posição atualizada |
| `player:left` | `{ id }` | Jogador saiu |
| `player:captured` | `{ id, name }` | Jogador capturado |
| `chat:msg` | `{ from, msg }` | Mensagem de chat |

---

## 🐛 Troubleshooting

**Tela preta ao iniciar**
→ Clique na tela para ativar o pointer lock (necessário para o mouse funcionar)

**"Servidor offline" / modo solo**
→ Certifique-se que `npm start` está rodando e acesse `http://localhost:3000` (não abra o HTML diretamente)

**Jogadores não aparecem**
→ Confirme que todos estão acessando o mesmo endereço IP e porta

**Lag alto**
→ Na mesma rede local o ping é < 5ms. Via internet depende da hospedagem escolhida

---

*SHADOWHOUSE — Nenhum de vocês vai sair desta mansão.*
