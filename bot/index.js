// ====== Imports e setup ======
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

const SERVER = 'http://127.0.0.1:8000';
const ALLOWED_CHAT = null; // opcional: se quiser restringir a um chat
const MEDIA_DIR = path.join(__dirname, '..', 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('📱 Escaneia o QR pra logar no WhatsApp Web');
});
client.on('authenticated', () => console.log('🔐 Authenticated'));
client.on('ready',        () => console.log('✅ Client ready'));
client.on('auth_failure', m  => console.log('❌ Auth failure:', m));
client.on('disconnected', r  => console.log('🔌 Disconnected:', r));
client.on('change_state', s  => console.log('🔄 State:', s));
client.on('loading_screen', (p,msg) => console.log('⏳ Loading:', p, msg||''));

// ====== Flags/Helpers ======
const REQUIRE_PREFIX_IN_GROUP = true;                  // Em grupo: exige @bot
const DM_HELP_COOLDOWN_MS     = 12 * 60 * 60 * 1000;   // 12h
const dmHelpMemory = new Map();                        // userId -> timestamp

function isUrl(s){ return /^https?:\/\//i.test(s || ''); }
function isLocalId(s){ s=(s||'').trim(); return /^#?\d{1,4}$/.test(s) || /^[A-Za-z]\d{3,}$/.test(s); }

// Parser com @bot (para grupos)
function cmd(text) {
  const m = (text || '').trim();
  if (!m.toLowerCase().startsWith('@bot')) return null;
  const parts = m.slice(4).trim().split(/\s+/);
  const name = (parts.shift() || '').toLowerCase();
  const rest = parts.join(' ');
  return { name, rest };
}

// Parser “natural” para DM (sem @bot)
function parseDmIntent(text) {
  const m = (text || '').trim();
  if (!m) return null;

  const vol = m.match(/\bvolume\s+(\d{1,3})\b/i);
  if (vol) return { name: 'volume', rest: vol[1] };

  if (/^(play|tocar|soltar)\b/i.test(m)) {
    const rest = m.replace(/^(play|tocar|soltar)\b/i, '').trim();
    return { name: 'tocar', rest };
  }

  if (/^(pause|pausar|parar)\b/i.test(m)) return { name: 'pause', rest: '' };
  if (/^(pular|next|próxima|proxima)\b/i.test(m)) return { name: 'pular',  rest: '' };
  if (/^(fila|queue)\b/i.test(m))               return { name: 'fila',   rest: '' };
  if (/^(limpar|clear)\b/i.test(m))             return { name: 'limpar', rest: '' };
  if (/^(ajuda|help)\b/i.test(m))               return { name: 'ajuda',  rest: '' };
  if (/^rotulo\s+/i.test(m)) {
    const [_, ...tail] = m.split(/\s+/);
    return { name: 'rotulo', rest: tail.join(' ') };
  }

  if (isUrl(m)) return { name: 'tocar', rest: m }; // URL direta
  return null;
}

const pending = new Map(); // chatId -> [results]

// ====== Listener principal ======
client.on('message', async msg => {
  try {
    console.log(`📩 Msg recebida de ${msg.from}: "${msg.body}"`);

    if (ALLOWED_CHAT && msg.from !== ALLOWED_CHAT) {
      console.log(`🚫 Ignorado (chat não autorizado: ${msg.from})`);
      return;
    }

    const chat = await msg.getChat();
    const isGroup = chat.isGroup;

    // ===== Upload de mídia (áudio) =====
    // DM: aceita sem @bot | Grupo: só se a mensagem começar com @bot
    if (msg.hasMedia) {
      const raw = (msg.body || '').trim().toLowerCase();
      const mentioned = raw.startsWith('@bot');
      const proceed = !isGroup || (isGroup && mentioned);
      if (proceed) {
        console.log('📥 Recebido arquivo de mídia');
        const media = await msg.downloadMedia();
        const ext = (media.mimetype.split('/')[1] || '').toLowerCase();
        if (!/^(mp3|wav|flac|aac|ogg|m4a)$/.test(ext)) {
          await msg.reply('❌ Só aceito arquivos de áudio (mp3, wav, flac, aac, ogg, m4a).');
          return;
        }
        const id = 'A' + Date.now().toString().slice(-6);
        const file = path.join(MEDIA_DIR, `${id}.${ext}`);
        fs.writeFileSync(file, Buffer.from(media.data, 'base64'));
        console.log(`💾 Arquivo salvo: ${file} (ID ${id})`);
        await axios.post(`${SERVER}/library/import`, { id, file, label: null });
        await msg.reply(
          `📥 áudio recebido (${ext}). ID: ${id}\n` +
          `Defina rótulo: ${isGroup ? '@bot ' : ''}rotulo ${id} <texto>\n` +
          `Tocar: ${isGroup ? '@bot ' : ''}tocar ${id}`
        );
        return;
      }
    }

    // ===== Seleção por número / sair (precisa vir antes do cmd(...)) =====
    {
      const raw = (msg.body || '').trim();
      const isNumberOnly = /^\d+$/.test(raw);
      const isExit       = /^sair$/i.test(raw);

      if (pending.has(msg.from) && (isNumberOnly || isExit)) {
        const list = pending.get(msg.from);

        if (isExit) {
          pending.delete(msg.from);
          await msg.reply('✅ Pesquisa cancelada.\nDica: use *tocar <link do YouTube>* para tocar um link direto.');
          return;
        }

        const idx = parseInt(raw, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= list.length) {
          await msg.reply('Índice inválido. Digite um número da lista ou *sair* para cancelar.');
          return;
        }

        const item = list[idx];
        try {
          await axios.post(`${SERVER}/yt/play`, { video_id: item.video_id });
          pending.delete(msg.from);
          await msg.reply(`▶️ ${item.title} — ${item.channel}`);
        } catch (e) {
          console.error('Erro ao tocar por número:', e);
          await msg.reply('❌ Não consegui iniciar a reprodução.');
        }
        return;
      }
    }

    // ===== Parsing de comandos =====
    let c = null;
    if (isGroup && REQUIRE_PREFIX_IN_GROUP) {
      // Grupo: exige @bot
      c = cmd(msg.body);
      if (!c) {
        console.log('ℹ️ Grupo: sem @bot → ignorado');
        return;
      }
    } else {
      // DM: aceita sem @bot (parser natural) e também aceita @bot se usar
      c = parseDmIntent(msg.body) || cmd(msg.body);
      if (!c) {
        const last = dmHelpMemory.get(msg.from) || 0;
        const now  = Date.now();
        if (now - last > DM_HELP_COOLDOWN_MS) {
          dmHelpMemory.set(msg.from, now);
          await msg.reply(
            "👋 Olá! Eu sou o RQ Assistente.\n" +
            "Aqui no privado você pode falar *sem @bot*.\n\n" +
            "Exemplos:\n" +
            "- *tocar <link/termo/ID>*\n" +
            "- *volume 50*\n" +
            "- *pular* | *pause* | *fila* | *limpar*\n" +
            "- *ajuda* para ver tudo\n"
          );
        }
        return;
      }
    }

    console.log(`⚙️ Comando detectado: ${c.name}, args: ${c.rest || ''}`);

    // ===== Execução =====
    if (c.name === 'rotulo') {
      const [code, ...rest] = (c.rest || '').split(/\s+/);
      const label = (rest.join(' ') || '').trim();
      if (!code || !label) return msg.reply(`${isGroup ? '@bot ' : ''}rotulo <ID> <rótulo>`);
      console.log(`🏷️ Atualizando rótulo ${code} -> ${label}`);
      await axios.post(`${SERVER}/library/label`, null, { params: { code, label }});
      return msg.reply(`✅ rótulo de ${code} atualizado`);
    }

    if (c.name === 'ajuda' || c.name === 'help') {
      return msg.reply(
        `📖 *Comandos disponíveis:*\n` +
        `${isGroup ? '@bot ' : ''}tocar <url|#id|texto>\n` +
        `Após a busca: *digite o número* (1–5) ou *sair*\n` +
        `${isGroup ? '@bot ' : ''}soltar (ou play/pause)\n` +
        `${isGroup ? '@bot ' : ''}pular\n` +
        `${isGroup ? '@bot ' : ''}volume <0-100>\n` +
        `${isGroup ? '@bot ' : ''}fila\n` +
        `${isGroup ? '@bot ' : ''}limpar\n` +
        `${isGroup ? '@bot ' : ''}rotulo <ID> <texto>\n` +
        `${isGroup ? '@bot ' : ''}ajuda`
      );
    }

    if (c.name === 'tocar' && c.rest) {
      const q = c.rest.trim();

      if (isUrl(q)) {
        console.log(`🎵 Tocar URL: ${q}`);
        const r = await axios.post(`${SERVER}/queue`, { query: q, requested_by: msg.author || msg.from });
        if (!r.data.ok) return msg.reply('❌ não consegui tocar (confirmação requerida).');
        return msg.reply('▶️ streaming...');
      }

      if (isLocalId(q)) {
        console.log(`🎵 Tocar por ID local: ${q}`);
        const s = await axios.post(`${SERVER}/library/search`, { query: q, limit: 1 });
        if (!s.data.results.length) return msg.reply('ID não encontrado.');
        await axios.post(`${SERVER}/queue/by-id`, { db_id: s.data.results[0].db_id });
        return msg.reply(`▶️ ${s.data.results[0].title}`);
      }

      // Aviso de latência antes da busca
      await msg.reply('🔎 Pesquisando no YouTube…');

      console.log(`🔍 Procurando no YouTube: ${q}`);
      const find = await axios.post(`${SERVER}/yt/search`, { query: q, limit: 5 });
      if (!find.data.ok || !find.data.results.length) {
        return msg.reply(
          '❌ Nada encontrado.\n' +
          'Dica: envie *tocar <link do YouTube>* para tocar um link direto.'
        );
      }

      pending.set(msg.from, find.data.results);
      const linhas = find.data.results
        .map((x,i)=>`${i+1}. ${x.title} — ${x.channel} [${x.duration}]`)
        .join('\n');

      return msg.reply(
        `Encontrei:\n${linhas}\n\n` +
        `*Digite apenas o número* da música desejada.\n` +
        `Se não encontrou, digite *sair*.\n` +
        `Dica: use *tocar <link do YouTube>* para tocar um link direto.`
      );
    }

    if (['soltar','play','pause'].includes(c.name)) {
      await axios.post(`${SERVER}/play`);
      return msg.reply('⏯️ play/pause');
    }

    if (c.name === 'pular' || c.name === 'next') {
      await axios.post(`${SERVER}/next`);
      return msg.reply('⏭️ próxima');
    }

    if (c.name === 'volume') {
      const v = parseInt((c.rest||''),10);
      if (isNaN(v)) return msg.reply(`${isGroup ? '@bot ' : ''}volume 0-100`);
      // Mantendo seu POST com params (como no código original)
      await axios.post(`${SERVER}/volume`, null, { params:{ value:v } });
      return msg.reply(`🔊 volume ${v}%`);
    }

    if (c.name === 'fila') {
      const r = await axios.get(`${SERVER}/queue`);
      const linhas = (r.data.playlist||[])
        .map(it => `${it.current?'▶️':'•'} ${it.index}. ${it.filename}`)
        .slice(0,10)
        .join('\n');
      return msg.reply(linhas || 'fila vazia');
    }

    if (c.name === 'limpar') {
      await axios.post(`${SERVER}/queue/clear`);
      return msg.reply('🧹 fila limpa');
    }

    // Fallback
    await msg.reply(
      `Comandos: ${isGroup ? '@bot ' : ''}tocar <url|#id|texto> | ` +
      `após a busca *número* (1–5) ou *sair* | ` +
      `${isGroup ? '@bot ' : ''}soltar | ${isGroup ? '@bot ' : ''}pular | ` +
      `${isGroup ? '@bot ' : ''}volume <0-100> | ${isGroup ? '@bot ' : ''}fila | ` +
      `${isGroup ? '@bot ' : ''}limpar | ${isGroup ? '@bot ' : ''}rotulo <ID> <texto>`
    );

  } catch (e) {
    console.error('💥 Erro ao processar comando:', e);
    await msg.reply('❌ erro ao processar comando');
  }
});

client.initialize();
