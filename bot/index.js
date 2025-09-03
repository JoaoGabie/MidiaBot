const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SERVER = 'http://127.0.0.1:8000';
const ALLOWED_CHAT = null; // opcional
const MEDIA_DIR = path.join(__dirname, '..', 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('📱 Escaneia o QR pra logar no WhatsApp Web');
});
client.on('authenticated', () => console.log('🔐 Authenticated'));
client.on('ready', () => console.log('✅ Client ready'));
client.on('auth_failure', m => console.log('❌ Auth failure:', m));
client.on('disconnected', r => console.log('🔌 Disconnected:', r));
client.on('change_state', s => console.log('🔄 State:', s));
client.on('loading_screen', (p,msg) => console.log('⏳ Loading:', p, msg||''));

function cmd(text) {
  const m = (text || '').trim();
  if (!m.startsWith('@bot')) return null;
  const parts = m.slice(4).trim().split(/\s+/);
  const name = (parts.shift() || '').toLowerCase();
  const rest = parts.join(' ');
  return { name, rest };
}
function isUrl(s){ return /^https?:\/\//i.test(s || ''); }
function isLocalId(s){ s=(s||'').trim(); return /^#?\d{1,4}$/.test(s) || /^[A-Za-z]\d{3,}$/.test(s); }

const pending = new Map(); // chatId -> [results]

client.on('message', async msg => {
  try {
    console.log(`📩 Msg recebida de ${msg.from}: "${msg.body}"`);

    if (ALLOWED_CHAT && msg.from !== ALLOWED_CHAT) {
      console.log(`🚫 Ignorado (chat não autorizado: ${msg.from})`);
      return;
    }

    // Upload de mídia
    if (msg.hasMedia) {
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
      await msg.reply(`📥 áudio recebido (${ext}). ID: ${id}\nDefina rótulo: @bot rotulo ${id} <texto>\nTocar: @bot tocar ${id}`);
      return;
    }

    const c = cmd(msg.body);
    if (!c) {
      console.log('ℹ️ Não é comando, ignorado');
      return;
    }

    console.log(`⚙️ Comando detectado: ${c.name}, args: ${c.rest}`);

    if (c.name === 'rotulo') {
      const [code, ...rest] = c.rest.split(/\s+/);
      const label = (rest.join(' ') || '').trim();
      if (!code || !label) return msg.reply('Use: @bot rotulo <ID> <rótulo>');
      console.log(`🏷️ Atualizando rótulo ${code} -> ${label}`);
      await axios.post(`${SERVER}/library/label`, null, { params: { code, label }});
      await msg.reply(`✅ rótulo de ${code} atualizado`);
      return;
    }

    if (c.name === 'ajuda' || c.name === 'help') {
  console.log('📖 Mostrando lista de comandos');
  return msg.reply(
    `📖 *Comandos disponíveis:*\n` +
    `@bot tocar <url|#id|texto>\n` +
    `@bot escolher <n>\n` +
    `@bot soltar (ou play/pause)\n` +
    `@bot pular\n` +
    `@bot volume <0-100>\n` +
    `@bot fila\n` +
    `@bot limpar\n` +
    `@bot rotulo <ID> <texto>\n` +
    `@bot ajuda`
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

      console.log(`🔍 Procurando no YouTube: ${q}`);
      const find = await axios.post(`${SERVER}/yt/search`, { query: q, limit: 5 });
      if (!find.data.ok || !find.data.results.length) return msg.reply('Nada encontrado.');
      pending.set(msg.from, find.data.results);
      const linhas = find.data.results.map((x,i)=>`${i+1}. ${x.title} — ${x.channel} [${x.duration}]`).join('\n');
      return msg.reply(`Encontrei:\n${linhas}\nResponda com "@bot escolher <n>".`);
    }

    if (c.name === 'escolher') {
      console.log(`👉 Escolher opção: ${c.rest}`);
      const list = pending.get(msg.from);
      if (!list) return msg.reply('Não há seleção pendente.');
      const idx = parseInt(c.rest, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= list.length) return msg.reply('Índice inválido.');
      const item = list[idx];
      await axios.post(`${SERVER}/yt/play`, { video_id: item.video_id });
      pending.delete(msg.from);
      return msg.reply(`▶️ ${item.title} — ${item.channel}`);
    }

    if (['soltar','play','pause'].includes(c.name)) {
      console.log('⏯️ Play/Pause');
      await axios.post(`${SERVER}/play`); return msg.reply('⏯️ play/pause');
    }
    if (c.name === 'pular') {
      console.log('⏭️ Próxima');
      await axios.post(`${SERVER}/next`); return msg.reply('⏭️ próxima');
    }
    if (c.name === 'volume') {
      const v = parseInt((c.rest||''),10);
      if (isNaN(v)) return msg.reply('Use: @bot volume 0-100');
      console.log(`🔊 Volume -> ${v}%`);
      await axios.post(`${SERVER}/volume`, null, { params:{ value:v } });
      return msg.reply(`🔊 volume ${v}%`);
    }
    if (c.name === 'fila') {
      console.log('📋 Pedindo fila');
      const r = await axios.get(`${SERVER}/queue`);
      const linhas = (r.data.playlist||[]).map(it => `${it.current?'▶️':'•'} ${it.index}. ${it.filename}`).slice(0,10).join('\n');
      return msg.reply(linhas || 'fila vazia');
    }
    if (c.name === 'limpar') {
      console.log('🧹 Limpando fila');
      await axios.post(`${SERVER}/queue/clear`); return msg.reply('🧹 fila limpa');
    }

    console.log('ℹ️ Comando não reconhecido');
    await msg.reply('Comandos: tocar <url|#id|texto> | escolher <n> | soltar | pular | volume <0-100> | fila | limpar | rotulo <ID> <texto>');
  } catch (e) {
    console.error('💥 Erro ao processar comando:', e);
    await msg.reply('❌ erro ao processar comando');
  }
});

client.initialize();
