// =========================================================================
// 🪐 server.js - PARÇA 1 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================
const net = require('net');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbPath = path.join(__dirname, 'sohbet.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ Veritabanı hatası:', err.message);
    else console.log('🛡️ SQLite Sunucusu Aktif: sohbet.db bağlandı!');
});

const fakeUserNicks = [
    'Can', 'Selin', 'Murat', 'Ebru', 'Hakan', 'Aylin', 'Deniz', 'Burak', 'Gamze', 'Volkan',
    'Melis', 'Serkan', 'Asli', 'Cem', 'Buse', 'Tolga', 'buse_22', 'Mert', 'Didem', 'Gokhan',
    'Esra', 'Kaan', 'Pinar', 'Emir', 'Gizem', 'Tugay', 'Zeynep', 'Omer', 'Irem', 'Alper',
    'Seda', 'Yigit', 'Damla', 'Tarik', 'Merve', 'Cenk', 'Kubra', 'Umut', 'Hande', 'Ozgur'
];

const botChatPhrases = [
    "Selam millet, naber?", "Bugun hava ne kadar guzel ya.", "Herkese keyifli sohbetler dilerim.",
    "Muzik harika caliyor, DJin eline saglik.", "Radyoda siradaki parca kime geliyor?",
    "Aynen katiliyorum sana.", "Hos bulduk yeni geldim ben de.", "Nasilsiniz, keyifler nasil?"
];
// =========================================================================
// 🪐 server.js - PARÇA 2 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================

const helpBotPhrases = [
    "🤖 ChatTV Resmi Yardim Merkezine Hos Geldiniz! Tum komutlar asagida siralanmistir:",
    "🔐 [RUMUZ SIFRELEME]: /msg NickServ REGISTER sifreniz eposta@adresiniz.com",
    "🔑 [KIMLIK DOGRULAMA]: /msg NickServ IDENTIFY sifreniz",
    "👑 [ODA TESCILLEME]: /msg ChanServ REGISTER #odaismi",
    "🎙️ [CANLI RADYODAN SOZ ISTE]: Sohbet odasinda !soz yazmaniz yeterlidir.",
    "⚠️ Dikkatinize: Kayitli rumuzlar giriste 60 saniye icinde identify yapmazsa otomatik dusurulur!"
];

// 🤖 Botların RAM üzerindeki odaları ilk başta eksiksiz tanımlandı!
let channelBotsMemory = { sohbet: [], radyo: [], oyun: [], goruntulu: [], help: [], oper: [] };

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS user_permissions (nick TEXT PRIMARY KEY, level INTEGER, title TEXT, prefix TEXT, password TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS nickserv (nick TEXT PRIMARY KEY, password TEXT, email TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS chanserv (room TEXT PRIMARY KEY, founder TEXT, topic TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS quiz_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT, answer TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS chat_quotes (id INTEGER PRIMARY KEY AUTOINCREMENT, quote_text TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS server_bots (nick TEXT PRIMARY KEY, current_room TEXT, status TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS server_bans (id INTEGER PRIMARY KEY AUTOINCREMENT, target_nick TEXT, ban_type TEXT, reason TEXT, admin_nick TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_nick TEXT, command_type TEXT, target_info TEXT, ip_address TEXT, date TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS active_video_sessions (socket_id TEXT PRIMARY KEY, nick TEXT, room TEXT, date TEXT)`);

   
    db.run(`INSERT OR IGNORE INTO quiz_questions (id, question, answer) VALUES (1, 'Turkiyenin baskenti neresidir?', 'ankara')`);
    db.run(`INSERT OR IGNORE INTO chat_quotes (id, quote_text) VALUES (1, 'Goz gordugunu sever, gonul hissettigini.')`);
    db.run(`DELETE FROM active_video_sessions`);

    fakeUserNicks.forEach(botNick => {
        db.run(`INSERT OR IGNORE INTO server_bots (nick, current_room, status) VALUES (?, 'sohbet', 'active')`);
        db.run(`INSERT OR IGNORE INTO user_permissions (nick, level, title, prefix, password) VALUES (?, 1, 'Regular User', '🟢', '')`, [botNick.toLowerCase()]);
    });
});

let activeIRCSockets = [];
let currentQuizQuestion = null;

app.use(express.static(__dirname + '/public'));
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/yazili', (req, res) => res.sendFile(__dirname + '/public/yazili.html'));
app.get('/goruntulu', (req, res) => res.sendFile(__dirname + '/public/goruntulu.html'));
// =========================================================================
// 🪐 server.js - PARÇA 3 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================

function broadcastBotAction(botNick, actionType, targetRoom, messageText = "") {
    if (!botNick || !targetRoom) return;
    const roomName = targetRoom.toLowerCase().trim();

    if (actionType === 'PRIVMSG' && messageText) {
        io.to(roomName).emit('receive_message', { nick: botNick, message: messageText, room: roomName, source: 'mirc', time: Date.now() });
        activeIRCSockets.forEach(s => {
            try {
                if (s && s.userData && s.userData.rooms && s.userData.rooms.includes(roomName)) {
                    s.write(`:${botNick}!bot@localhost PRIVMSG #${roomName} :${messageText}\r\n`);
                }
            } catch (err) {}
        });
    }
}

// 🤖 Botları odalara bölüp hem DB'ye hem de RAM belleğe (channelBotsMemory) kusursuz işleyen motor!
function initializeBotsToMemory() {
    console.log("🤖 40 Yapay Zeka Botu Canlı RAM Belleğine Sabitleniyor...");
    channelBotsMemory.sohbet = []; channelBotsMemory.radyo = []; channelBotsMemory.oyun = []; channelBotsMemory.goruntulu = [];
    channelBotsMemory.help = []; channelBotsMemory.oper = [];

    fakeUserNicks.forEach((botNick, index) => {
        let assignedRoom = 'sohbet';
        if (index % 4 === 1) assignedRoom = 'radyo';
        else if (index % 4 === 2) assignedRoom = 'oyun';
        else if (index % 4 === 3) assignedRoom = 'goruntulu';

        channelBotsMemory[assignedRoom].push(botNick);
        db.run(`UPDATE server_bots SET current_room = ? WHERE nick = ?`, [assignedRoom, botNick]);
    });
    console.log("🛡️ Bellek Senkronizasyonu Tamam: Botlar odalarına (mIRC Listesine) yerleşti!");
}
initializeBotsToMemory();

function startBotChatAI() {
    setInterval(() => {
        if (fakeUserNicks.length === 0) return;
        const randomBot = fakeUserNicks[Math.floor(Math.random() * fakeUserNicks.length)];
        db.get(`SELECT current_room FROM server_bots WHERE nick = ?`, [randomBot], (err, row) => {
            if (row && row.current_room) {
                const randomPhrase = botChatPhrases[Math.floor(Math.random() * botChatPhrases.length)];
                broadcastBotAction(randomBot, 'PRIVMSG', row.current_room, randomPhrase);
            }
        });
    }, 12000);
}
setTimeout(startBotChatAI, 8000);
// =========================================================================
// 🪐 server.js - PARÇA 4 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================

function botWelcomeTrigger(userNick, roomName) {
    if (!userNick || !roomName || fakeUserNicks.includes(userNick)) return;
    const roomClean = roomName.toLowerCase().replace('#', '').trim();
    setTimeout(() => {
        const roomBots = channelBotsMemory[roomClean];
        if (roomBots && roomBots.length > 0) {
            const randomBot = roomBots[Math.floor(Math.random() * roomBots.length)];
            const welcomePhrases = [
                `Hos geldin ${userNick}, nasilsin?`,
                `Selam ${userNick}, sunucumuza hos geldin keyifli sohbetler dilerim.`
            ];
            broadcastBotAction(randomBot, 'PRIVMSG', roomClean, welcomePhrases[Math.floor(Math.random() * welcomePhrases.length)]);
        }
    }, 2500);
}

function triggerNextQuizQuestion() {
    db.get(`SELECT * FROM quiz_questions ORDER BY RANDOM() LIMIT 1`, [], (err, row) => {
        if (row) {
            currentQuizQuestion = row;
            const botMsg = `🧠 Soru: ${row.question} [Cevap yazmak icin duz mesaj gonderin]`;
            io.to('oyun').emit('receive_message', { nick: '🤖 Yarismaci', message: botMsg, room: 'oyun' });
            activeIRCSockets.forEach(s => {
                try {
                    if (s && s.userData && s.userData.rooms && s.userData.rooms.includes('oyun')) {
                        s.write(`:Yarismaci!bot@localhost PRIVMSG #oyun :${botMsg}\r\n`);
                    }
                } catch (e) {}
            });
        }
    });
}
setTimeout(triggerNextQuizQuestion, 6000);

function checkQuizAnswer(userNick, userMessage) {
    if (!currentQuizQuestion || !userNick || !userMessage) return;
    if (userMessage.toLowerCase().trim() === currentQuizQuestion.answer) {
        const winMsg = `🎉 Tebrikler ${userNick}! Dogru Cevap: ${currentQuizQuestion.answer.toUpperCase()}. (+10 Puan)`;
        io.to('oyun').emit('receive_message', { nick: '🤖 Yarismaci', message: winMsg, room: 'oyun' });
        activeIRCSockets.forEach(s => {
            try {
                if (s && s.userData && s.userData.rooms && s.userData.rooms.includes('oyun')) {
                    s.write(`:Yarismaci!bot@localhost PRIVMSG #oyun :${winMsg}\r\n`);
                }
            } catch (e) {}
        });
        currentQuizQuestion = null;
        setTimeout(triggerNextQuizQuestion, 4000);
    }
}
// =========================================================================
// 🪐 server.js - PARÇA 5 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================

function triggerQuoteBot(targetRoom) {
    const roomClean = targetRoom.toLowerCase().replace('#', '').trim();
    db.get(`SELECT * FROM chat_quotes ORDER BY RANDOM() LIMIT 1`, [], (err, row) => {
        if (row) {
            const quoteMsg = `📜 Soz: "${row.quote_text}"`;
            io.to(roomClean).emit('receive_message', { nick: '🤖 Soz_Botu', message: quoteMsg, room: roomClean });
            activeIRCSockets.forEach(s => {
                try {
                    if (s && s.userData && s.userData.rooms && s.userData.rooms.includes(roomClean)) {
                        s.write(`:Soz_Botu!bot@localhost PRIVMSG #${roomClean} :${quoteMsg}\r\n`);
                    }
                } catch (e) {}
            });
        }
    });
}

// 🛡️ KUSURSUZ IRC SERVİSLERİ MOTORU (NICKSERV ŞİFRE & PARAMETRE FIX)
function processIRCServices(ircSocket, userNick, rawData) {
    try {
        const cleanRaw = rawData.replace(/[\r\n]/g, "").trim();
        const parts = cleanRaw.split(' ').filter(p => p !== '');
        const privmsgIndex = parts.findIndex(p => p && p.toUpperCase() === 'PRIVMSG');
        if (privmsgIndex === -1 || !parts[privmsgIndex + 1]) return false;
        
        const targetBot = parts[privmsgIndex + 1].toUpperCase().replace(/[:!]/g, '').trim();
        let fullCmdText = cleanRaw.indexOf(' :') !== -1 ? cleanRaw.substring(cleanRaw.indexOf(' :') + 2).trim() : parts.slice(privmsgIndex + 2).join(' ').replace(':', '').trim();
        if (!targetBot || !fullCmdText) return false;
        
        const cmdParts = fullCmdText.split(' ').filter(p => p !== '');
        const cmd = cmdParts && cmdParts[0] ? cmdParts[0].toUpperCase() : ''; 
        const args = fullCmdText.substring(fullCmdText.indexOf(' ') + 1).trim();         

        if (targetBot.includes('NICKSERV')) {
            if (cmd === 'REGISTER' && args && args !== 'REGISTER') {
                const regPass = args.split(' ')[0].trim();
                db.get(`SELECT * FROM nickserv WHERE nick = ?`, [userNick.toLowerCase()], (err, row) => {
                    if (row) ircSocket.write(`:NickServ NOTICE ${userNick} :⚠️ Bu rumuz zaten tescillidir!\r\n`);
                    else {
                        db.run(`INSERT INTO nickserv (nick, password, email, date) VALUES (?, ?, ?, ?)`, [userNick.toLowerCase(), regPass, 'destek@chattv.com.tr', Date.now().toString()], () => {
                            ircSocket.write(`:NickServ NOTICE ${userNick} :✅ Rumuzunuz (${userNick}) SQLite ile sifrelendi. Sifreniz: ${regPass} 🔐\r\n`);
                        });
                    }
                });
                return true;
            }
// =========================================================================
// 🪐 server.js - PARÇA 6 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================

            if (cmd === 'IDENTIFY' && args && args !== 'IDENTIFY') {
                const idPass = args.split(' ')[0].trim();
                db.get(`SELECT * FROM nickserv WHERE nick = ?`, [userNick.toLowerCase()], (err, row) => {
                    if (row && row.password.trim() === idPass) {
                        if (ircSocket.identifyTimeout) { clearTimeout(ircSocket.identifyTimeout); ircSocket.identifyTimeout = null; }
                        ircSocket.userData.identified = true;
                        ircSocket.write(`:NickServ NOTICE ${userNick} :✨ Sifre kabul edildi. Kimliginiz dogrulandi!\r\n`);
                    } else { ircSocket.write(`:NickServ NOTICE ${userNick} :❌ HATA: Yanlis sifre girdiniz!\r\n`); }
                });
                return true;
            }
        }
        if (targetBot.includes('CHANSERV') && (cmd === 'REGISTER' || cmd === 'TOPIC') && args) {
            const targetRoom = cmdParts[1] ? cmdParts[1].replace('#', '').toLowerCase().trim() : 'sohbet';
            db.run(`INSERT OR IGNORE INTO chanserv (room, founder, topic, date) VALUES (?, ?, 'Canli Odalar', ?)`, [targetRoom, userNick.toLowerCase(), Date.now().toString()], () => {
                ircSocket.write(`:ChanServ NOTICE ${userNick} :👑 #${targetRoom} odasi tescillendi.\r\n`);
                db.run(`INSERT INTO system_logs (admin_nick, command_type, target_info, ip_address, date) VALUES (?, 'CHANSERV_REGISTER', ?, 'localhost', ?)`, [userNick, targetRoom, Date.now().toString()]);
            });
            return true;
        }
        if (targetBot.includes('OPERSERV') && ircSocket.userData.isOper && cmd === 'GLOBAL' && args) {
            const globalMsg = `🚨 [GLOBAL DUYURU]: ${args}`;
            io.emit('receive_message', { nick: '🛡️ OperServ', message: globalMsg, room: 'global' });
            activeIRCSockets.forEach(s => { try { s.write(`:OperServ!services@localhost PRIVMSG * :${globalMsg}\r\n`); } catch (e) {} });
            db.run(`INSERT INTO system_logs (admin_nick, command_type, target_info, ip_address, date) VALUES (?, 'OPERSERV_GLOBAL', ?, 'localhost', ?)`, [userNick, args.substring(0, 100), Date.now().toString()]);
            return true;
        }
        if (targetBot.includes('HOSTSERV') && cmd === 'ASSIGN' && args) {
            const targetUser = cmdParts[1] ? cmdParts[1].trim() : '';
            const newHost = cmdParts[2] ? cmdParts[2].trim() : '://chattv.com.tr';
            let foundSocket = activeIRCSockets.find(s => s.userData && s.userData.nick.toLowerCase() === targetUser.toLowerCase());
            if (foundSocket) {
                foundSocket.userData.cloakHost = newHost;
                ircSocket.write(`:HostServ NOTICE ${userNick} :✅ ${targetUser} kullanicisinin yeni hostu aktif edildi: ${newHost}\r\n`);
                foundSocket.write(`:${targetUser}!user@${newHost} MODE ${targetUser} +x\r\n`);
                db.run(`INSERT INTO system_logs (admin_nick, command_type, target_info, ip_address, date) VALUES (?, 'HOSTSERV_ASSIGN', ?, 'localhost', ?)`, [userNick, `${targetUser} -> ${newHost}`, Date.now().toString()]);
            } else { ircSocket.write(`:HostServ NOTICE ${userNick} :❌ HATA: Kullanici aktif degil!\r\n`); }
            return true;
        }
    } catch (e) { console.error("Servis hatasi:", e); }
    return false;
}
// =========================================================================
// 🪐 server.js - PARÇA 7 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================

const ircServer = net.createServer((ircSocket) => {
    ircSocket.setEncoding('utf-8'); 
    activeIRCSockets.push(ircSocket);
    ircSocket.userData = { nick: 'Client_' + Math.floor(1000 + Math.random() * 9000), rooms: [], identified: false, isOper: false, cloakHost: "user@localhost" };

    function triggerAutoJoin(targetNick) {
        const roomList = ['sohbet', 'radyo', 'oyun', 'goruntulu'];
        roomList.forEach(roomName => {
            if (!ircSocket.userData.rooms.includes(roomName)) ircSocket.userData.rooms.push(roomName);
            const userHost = ircSocket.userData.isOper ? ircSocket.userData.cloakHost : "user@localhost";
            ircSocket.write(`:${targetNick}!${userHost} JOIN #${roomName}\r\n`);
            ircSocket.write(`:localhost 332 ${targetNick} #${roomName} :Canli ChatTV Odasi\r\n`);
            
            db.get(`SELECT * FROM user_permissions WHERE LOWER(nick) = ?`, [targetNick.toLowerCase()], (err, row) => {
                let sym = row ? (row.level === 10 ? "~" : (row.level === 9 ? "&" : (row.level === 8 ? "@" : (row.level === 5 ? "%" : "+")))) : "";
                let namesPayload = `${sym}${targetNick}`;
                if (roomName === 'oyun') namesPayload += " +Yarismaci";
                if (roomName === 'sohbet') namesPayload += " +Soz_Botu";
                if (roomName === 'help') namesPayload += " +HelpBot";
                const roomBots = channelBotsMemory[roomName];
                if (roomBots && roomBots.length > 0) namesPayload += " " + roomBots.map(b => `+${b}`).join(' ');
                
                ircSocket.write(`:localhost 353 ${targetNick} = #${roomName} :${namesPayload}\r\n`);
                ircSocket.write(`:localhost 366 ${targetNick} #${roomName} :End of /NAMES list.\r\n`);
            });
            botWelcomeTrigger(targetNick, roomName);
        });
    }
// =========================================================================
// 🪐 server.js - PARÇA 8 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================

    ircSocket.on('data', (data) => {
        if (!data) return;
        const raw = data.toString(); 
        const cleanRaw = raw.replace(/[\r\n]/g, "").trim(); 
        const parts = cleanRaw.split(' ').filter(p => p !== '');
        if (parts.length === 0) return;

        // Dizi hatası (parts.toUpperCase) tamamen giderildi!
        const firstCmd = parts[0] ? parts[0].toUpperCase() : '';
        if (cleanRaw.toUpperCase().startsWith('PING')) { 
            ircSocket.write(`:localhost PONG localhost\r\n`); 
            return; 
        }

        const cmdIndex = parts.findIndex(p => p && p.toUpperCase() === 'NICK');
        if (cmdIndex !== -1 && parts[cmdIndex + 1]) {
            const oldNick = ircSocket.userData.nick; 
            const newNick = parts[cmdIndex + 1].replace(/[\r\n]/g, "").replace(':', '').trim();
            if (!newNick) return;
            
            db.get(`SELECT * FROM server_bans WHERE LOWER(target_nick) = ?`, [newNick.toLowerCase()], (err, banRow) => {
                if (banRow) {
                    ircSocket.write(`:localhost NOTICE ${newNick} :❌ SUNUCUDAN UZAKLAŞTIRILDINIZ! (Banned)\r\n`);
                    ircSocket.end();
                    return;
                }
                ircSocket.userData.nick = newNick;
                ircSocket.write(`:${oldNick} NICK ${newNick}\r\n`);
                
                if (oldNick.startsWith('Client_')) {
                    ircSocket.write(`:localhost 001 ${newNick} :Welcome to the ChatTV-Net IRC Network ${newNick}\r\n`);
                    ircSocket.write(`:localhost 005 ${newNick} PREFIX=(qaohv)~&@%+ CHANTYPES=# NETWORK=ChatTV-Net :are supported\r\n`);
                    ircSocket.write(`:localhost 376 ${newNick} :End of /MOTD command.\r\n`);
                    
                    // Bağlantı bittiği an sıralı oto-join güvenle tetikleniyor!
                    setTimeout(() => { triggerAutoJoin(newNick); }, 400);

                    db.get(`SELECT * FROM nickserv WHERE nick = ?`, [newNick.toLowerCase()], (err, row) => {
                        if (row) {
                            ircSocket.write(`:NickServ NOTICE ${newNick} :⚠️ DİKKAT: Bu rumuz şifrelidir! /msg NickServ IDENTIFY şifre\r\n`);
                            if (ircSocket.identifyTimeout) clearTimeout(ircSocket.identifyTimeout);
                            ircSocket.identifyTimeout = setTimeout(() => {
                                if (!ircSocket.userData.identified) {
                                    const guestNick = 'Misafir_' + Math.floor(1000 + Math.random() * 9000);
                                    ircSocket.write(`:${ircSocket.userData.nick} NICK ${guestNick}\r\n`);
                                    ircSocket.userData.nick = guestNick;
                                }
                            }, 60000);
                        }
                    });
                }
            });
            return;
        }
// =========================================================================
// 🪐 server.js - PARÇA 9 / 10 (RESMİ, KUSURSUZ VE TAMİR EDİLMİŞ MOTOR)
// =========================================================================

        const operIndex = parts.findIndex(p => p && p.toUpperCase() === 'OPER');
        if (operIndex !== -1 && parts[operIndex + 1]) {
            const operNickArg = parts[operIndex + 1].replace(/[\r\n]/g, "").trim();
            const operPass = parts[operIndex + 2] ? parts[operIndex + 2].replace(/[\r\n]/g, "").trim() : '';
            db.get(`SELECT * FROM user_permissions WHERE LOWER(nick) = ? AND password = ?`, [operNickArg.toLowerCase(), operPass], (err, row) => {
                if (row && row.level >= 6) {
                    ircSocket.userData.nick = row.nick;
                    ircSocket.userData.cloakHost = "://chattv.com.tr";
                    ircSocket.userData.isOper = true;
                    ircSocket.write(`:localhost 381 ${row.nick} :✨ ChatTV Operator Yetkileriniz Aktif!\r\n`);
                    ircSocket.write(`:${row.nick}!oper@://chattv.com.tr MODE ${row.nick} +B\r\n`);
                    db.run(`INSERT INTO system_logs (admin_nick, command_type, target_info, ip_address, date) VALUES (?, 'OPER_LOGIN', 'mIRC Üzerinden Başarılı Giriş', 'localhost', ?)`, [row.nick, Date.now().toString()]);
                } else { ircSocket.write(`:localhost 491 ${ircSocket.userData.nick} :❌ HATA: Gecersiz Sifre!\r\n`); }
            });
            return;
        }

        if (['KILL', 'GLINE', 'KLINE', 'ZLINE'].includes(firstCmd) && ircSocket.userData.isOper) {
            const targetNick = parts ? parts.trim() : '';
            const reason = parts.slice(2).join(' ').replace(':', '').trim() || 'Yonetici karariyla uzaklastirildiniz.';
            const adminNick = ircSocket.userData.nick;

            if (targetNick) {
                db.run(`INSERT INTO server_bans (target_nick, ban_type, reason, admin_nick, date) VALUES (?, ?, ?, ?, ?)`, 
                    [targetNick.toLowerCase(), firstCmd, reason, adminNick, Date.now().toString()], () => {
                    db.run(`INSERT INTO system_logs (admin_nick, command_type, target_info, ip_address, date) VALUES (?, ?, ?, 'localhost', ?)`, [adminNick, `COMMAND_${firstCmd}`, `${targetNick} -> ${reason}`, Date.now().toString()]);

                    const banNotice = `🚨 [CEZA SİSTEMİ]: ${targetNick} kullanicisi ${adminNick} tarafindan sunucudan KALICI olarak uzaklastirildi. Tip: ${firstCmd} | Sebep: ${reason}`;
                    io.emit('receive_message', { nick: '🛡️ Sunucu', message: banNotice, room: 'global' });
                    
                    let targetSocket = activeIRCSockets.find(s => s.userData && s.userData.nick.toLowerCase() === targetNick.toLowerCase());
                    if (targetSocket) {
                        targetSocket.write(`:localhost NOTICE ${targetNick} :⚠️ KALICI ${firstCmd} CEZASI ALDINIZ! Sebep: ${reason}\r\n`);
                        targetSocket.write(`ERROR :Closing Link: localhost (${firstCmd} by ${adminNick}: ${reason})\r\n`);
                        targetSocket.end();
                    }
                    ircSocket.write(`:localhost NOTICE ${adminNick} :✅ ${targetNick} basariyla KALICI uzaklastirildi.\r\n`);
                });
            }
            return;
        }

        if (firstCmd === 'JOIN' && parts) {
            const rawRooms = parts.toLowerCase().replace(/[\r\n]/g, "").trim();
            const roomList = rawRooms.split(',');
            roomList.forEach(rawRoom => {
                const roomName = rawRoom.replace('#', '').trim();
                if (!roomName || roomName === 'null') return;
                if (!ircSocket.userData.rooms.includes(roomName)) {
                    ircSocket.userData.rooms.push(roomName);
                    const userHost = ircSocket.userData.isOper ? ircSocket.userData.cloakHost : "user@localhost";
                    ircSocket.write(`:${ircSocket.userData.nick}!${userHost} JOIN #${roomName}\r\n`);
                }
            });
            return;
        }
// =========================================================================
// 🪐 server.js - PARÇA 10 / 10 (PRIVMSG, WEB SOKET VE SUNUCU ATEŞLEME)
// =========================================================================

        if (cleanRaw.toUpperCase().includes('PRIVMSG')) {
            const privmsgIndex = parts.findIndex(p => p && p.toUpperCase() === 'PRIVMSG');
            if (privmsgIndex !== -1 && parts[privmsgIndex + 1]) {
                const target = parts[privmsgIndex + 1].toUpperCase().replace(':', '').trim();
                if (target.includes('NICKSERV') || target.includes('CHANSERV')) {
                    processIRCServices(ircSocket, ircSocket.userData.nick, raw); 
                    return;
                }
            }
            const currentRoom = parts[privmsgIndex + 1] ? parts[privmsgIndex + 1].toLowerCase().trim() : '';
            if (currentRoom.startsWith('#')) {
                const roomClean = currentRoom.replace('#', '');
                const actualMessage = raw.substring(raw.indexOf(':') + 1).replace(/[\r\n]/g, "").trim();
                if (!roomClean || !actualMessage) return;

                io.to(roomClean).emit('receive_message', { nick: ircSocket.userData.nick, message: actualMessage, room: roomClean });
                activeIRCSockets.forEach(s => {
                    try {
                        if (s && s.userData && s.userData.rooms && s.userData.rooms.includes(roomClean) && s !== ircSocket) {
                            const activeUserHost = ircSocket.userData.isOper ? ircSocket.userData.cloakHost : "user@localhost";
                            s.write(`:${ircSocket.userData.nick}!${activeUserHost} PRIVMSG #${roomClean} :${actualMessage}\r\n`);
                        }
                    } catch (e) {}
                });
                if (roomClean === 'oyun') checkQuizAnswer(ircSocket.userData.nick, actualMessage);
                if (roomClean === 'sohbet' && actualMessage.toLowerCase() === '!soz') triggerQuoteBot('sohbet');
            }
        }
    });

    ircSocket.on('close', () => { 
        if (ircSocket.identifyTimeout) clearTimeout(ircSocket.identifyTimeout); 
        activeIRCSockets = activeIRCSockets.filter(s => s !== ircSocket); 
    });
    ircSocket.on('error', (err) => {});
});

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        if (!data || !data.room) return;
        const roomName = data.room.toLowerCase().replace('#', '').trim();
        const userNick = data.nick || 'Misafir_' + Math.floor(1000 + Math.random() * 9000);
        db.get(`SELECT * FROM server_bans WHERE LOWER(target_nick) = ?`, [userNick.toLowerCase()], (err, banRow) => {
            if (banRow) { 
                socket.disconnect(); 
                return; 
            }
            socket.join(roomName); 
            socket.nick = userNick; 
            socket.currentRoom = roomName;
            const roomBots = channelBotsMemory[roomName];
            if (roomBots) socket.emit('update_bot_list', roomBots);
            botWelcomeTrigger(userNick, roomName);
        });
    });
    socket.on('send_message', (data) => {
        if (!data || !data.room || !data.message) return;
        const roomName = data.room.toLowerCase().replace('#', '').trim();
        io.to(roomName).emit('receive_message', data);
        activeIRCSockets.forEach(s => {
            try {
                if (s && s.userData && s.userData.rooms && s.userData.rooms.includes(roomName)) {
                    const senderHost = s.userData.isOper ? s.userData.cloakHost : "user@localhost";
                    s.write(`:${data.nick}!${senderHost} PRIVMSG #${roomName} :${data.message}\r\n`);
                }
            } catch (e) {}
        });
        if (roomName === 'oyun') checkQuizAnswer(data.nick, data.message);
        if (roomName === 'sohbet' && data.message.toLowerCase() === '!soz') triggerQuoteBot('sohbet');
    });
});

server.listen(3000, () => console.log('🚀 Web Sunucusu Port 3000 uzerinde aktif!'));
ircServer.listen(6667, () => console.log('🚀 IRC Sunucusu Port 6667 uzerinde aktif!'));
