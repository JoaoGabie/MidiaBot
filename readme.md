📖 MidiaBot – Documentação

Este projeto é dividido em três partes principais:

Server (FastAPI) → API backend para gerenciar fila, playback e biblioteca.

Bot (WhatsApp) → Interface via WhatsApp para controlar a música.

UI (Next.js + Tailwind + Electron) → Interface gráfica de controle.

🚀 Pré-requisitos

Python 3.12+ (para o Server)

Node.js 20+ (para Bot e UI)

npm ou yarn (gerenciador de pacotes)

MPV instalado (biblioteca libmpv-2.dll deve estar acessível no PATH no Windows)

📦 Instalação

Clone o projeto e entre na pasta:

git clone https://github.com/seu-repo/midia-bot.git
cd midia-bot


Crie os ambientes necessários:

1. Server (FastAPI)
cd server
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt


Rodar o servidor:

uvicorn main:app --host 127.0.0.1 --port 8000 --reload


Rotas disponíveis:

Swagger UI → http://127.0.0.1:8000/docs

ReDoc → http://127.0.0.1:8000/redoc

2. Bot (WhatsApp)
cd bot
npm install


Rodar o bot:

node index.js


👉 Na primeira vez, vai aparecer um QR Code no terminal → escaneie com o WhatsApp.

Comandos principais no chat do WhatsApp:

@bot tocar <url|texto|id> → tocar música

@bot escolher <n> → escolher item de busca

@bot pular → próxima faixa

@bot soltar → play/pause

@bot fila → ver fila

@bot limpar → limpar fila

@bot volume <0-100> → ajustar volume

@bot rotulo <id> <texto> → adicionar rótulo a música

3. UI (Next.js + Tailwind + Electron)
cd ui
npm install


Rodar em modo dev:

npm run dev


Rodar com Electron:

npm run electron:dev


Buildar versão desktop:

npm run electron:build

⚙️ Estrutura do Projeto
midia-bot/
│── server/        # FastAPI backend
│── bot/           # WhatsApp bot
│── ui/            # Frontend Next.js + Tailwind + Electron
│── media/         # Arquivos de áudio enviados via WhatsApp

🛠️ Tecnologias

Backend: FastAPI, Uvicorn, yt-dlp, python-mpv

Bot: whatsapp-web.js, axios

Frontend: Next.js 15, TailwindCSS 3, shadcn/ui, Electron

👉 Assim você tem tudo documentado.
Quer que eu já gere esse arquivo em formato README.md pronto pra colar na raiz do projeto?